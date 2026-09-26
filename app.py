from flask import Flask, request, jsonify, session, render_template, redirect, url_for
from flask_cors import CORS
import smtplib
from email.mime.text import MIMEText
import random
import time
import re
import os
import uuid
import json
from datetime import datetime, timezone, timedelta
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
from pywebpush import webpush, WebPushException

import config
import db

app = Flask(__name__)
app.secret_key = config.SECRET_KEY

# ================= 1. Session cookie settings (used by /admin only) =================
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = True
app.permanent_session_lifetime = 60 * 60 * 24 * 7

# ================= 2. CORS (frontend <-> backend) =================
ALLOWED_ORIGINS = getattr(config, "ALLOWED_ORIGINS", ["https://duttaanubhab777-code.github.io"])
CORS(app, supports_credentials=True, origins=ALLOWED_ORIGINS, allow_headers=["Content-Type", "Authorization"])

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
MIN_PASSWORD_LENGTH = 8

IST = timezone(timedelta(hours=5, minutes=30))
MAX_AVATAR_BASE64_CHARS = 400_000

db.init_db()

# ================= 3. In-memory stores =================
pending_signups = {}          
reset_otp_store = {}          
active_tokens = {}            
login_attempt_log = {}        
admin_login_attempt_log = {}  

TOKEN_MAX_AGE_SECONDS = getattr(config, "TOKEN_MAX_AGE_SECONDS", 7 * 24 * 60 * 60)   
PRESENCE_ONLINE_WINDOW_SECONDS = getattr(config, "PRESENCE_ONLINE_WINDOW_SECONDS", 90)
LOGIN_MAX_ATTEMPTS = getattr(config, "LOGIN_MAX_ATTEMPTS", 5)
LOGIN_ATTEMPT_WINDOW_SECONDS = getattr(config, "LOGIN_ATTEMPT_WINDOW_SECONDS", 15 * 60)
OTP_MAX_VERIFY_ATTEMPTS = 5

CHAT_HISTORY_LIMIT = getattr(config, "CHAT_HISTORY_LIMIT", 300)

VAPID_PUBLIC_KEY = getattr(config, "VAPID_PUBLIC_KEY", None)
VAPID_PRIVATE_KEY = getattr(config, "VAPID_PRIVATE_KEY", None)
VAPID_CLAIM_EMAIL = getattr(config, "VAPID_CLAIM_EMAIL", "mailto:admin@example.com")
PUSH_ENABLED = bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)

KILL_SWITCH_PASSWORD = getattr(config, "KILL_SWITCH_PASSWORD", None)
KILL_SWITCH_CONFIRM_PHRASE = "DELETE EVERYTHING"


def send_otp_email(to_email, otp, purpose="login"):
    subject = "Verify Your Beyonder AI Account - Verification Code"

    body = f"""Welcome to Beyonder AI!

Hello,

Thank you for choosing Beyonder AI. We are thrilled to have you onboard!

To complete your sign-in process and verify your account security, please use the one-time verification code (OTP) provided below:
                                 {otp}
Important Security Notice:
* This verification code is strictly confidential and will expire in {config.OTP_EXPIRY_SECONDS // 60} minutes.
* Beyonder AI will never ask you to share your OTP or passwords with anyone.
* If you did not request this code, no action is needed. You can safely ignore this email.

Need help or have questions? Feel free to reach out to our team at any time.

Best regards,
The Beyonder AI Team

========================================================
Created & Developed by Arnab Adhikari & Anubhab Dutta
© 2026 Beyonder AI. All rights reserved."""

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = config.GMAIL_ADDRESS
    msg["To"] = to_email

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(config.GMAIL_ADDRESS, config.GMAIL_APP_PASSWORD)
        server.sendmail(config.GMAIL_ADDRESS, [to_email], msg.as_string())


# ================= 4. Presence / token helpers =================
def _prune_expired_tokens():
    now = time.time()
    expired = [t for t, info in active_tokens.items() if now - info["created_at"] > TOKEN_MAX_AGE_SECONDS]
    for t in expired:
        active_tokens.pop(t, None)

def _touch_presence(token):
    if token in active_tokens:
        active_tokens[token]["last_seen"] = time.time()

def get_online_users():
    _prune_expired_tokens()
    now = time.time()
    online = {}
    for info in active_tokens.values():
        if now - info["last_seen"] <= PRESENCE_ONLINE_WINDOW_SECONDS:
            email = info["email"]
            if email not in online or info["last_seen"] > online[email]:
                online[email] = info["last_seen"]
    return online


# ================= 4b. Push notification helper =================
def send_push_to_user(email, title, body, url="index.html"):
    if not PUSH_ENABLED:
        return

    subs = db.get_push_subscriptions_for_user(email)
    for sub in subs:
        subscription_info = {
            "endpoint": sub["endpoint"],
            "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
        }
        try:
            webpush(
                subscription_info=subscription_info,
                data=json.dumps({"title": title, "body": body, "url": url}),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_CLAIM_EMAIL},
            )
        except WebPushException as ex:
            status = getattr(ex.response, "status_code", None)
            if status in (404, 410):
                db.delete_push_subscription(sub["endpoint"])
        except Exception:
            continue


# ================= 5. Rate limiting helpers =================
def _is_rate_limited(log_dict, key, max_attempts, window_seconds):
    now = time.time()
    attempts = [t for t in log_dict.get(key, []) if now - t < window_seconds]
    log_dict[key] = attempts
    return len(attempts) >= max_attempts

def _record_attempt(log_dict, key):
    log_dict.setdefault(key, []).append(time.time())

def _clear_attempts(log_dict, key):
    log_dict.pop(key, None)


# ================= 6. Auth decorators =================
def api_login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        token = request.headers.get("Authorization")
        if not token or token not in active_tokens:
            return jsonify({"success": False, "message": "Login required."}), 401

        info = active_tokens[token]
        if time.time() - info["created_at"] > TOKEN_MAX_AGE_SECONDS:
            active_tokens.pop(token, None)
            return jsonify({"success": False, "message": "Session expired. Please log in again."}), 401

        _touch_presence(token)
        request.user_email = info["email"]
        return view(*args, **kwargs)
    return wrapped

def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("is_admin"):
            return redirect(url_for("admin_home"))
        return view(*args, **kwargs)
    return wrapped

def admin_api_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("is_admin"):
            return jsonify({"success": False, "message": "Admin session required."}), 401
        return view(*args, **kwargs)
    return wrapped


@app.template_filter("datetimeformat")
def datetimeformat(value):
    try:
        return datetime.fromtimestamp(value, tz=IST).strftime("%Y-%m-%d %I:%M:%S %p IST")
    except Exception:
        return "-"

@app.template_filter("timeago")
def timeago(value):
    try:
        seconds = max(0, time.time() - value)
    except Exception:
        return "-"
    if seconds < 60:
        return "just now"
    minutes = int(seconds // 60)
    if minutes < 60:
        return f"{minutes}m ago"
    hours = int(minutes // 60)
    return f"{hours}h ago"

def client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"

@app.teardown_appcontext
def _close_db(exception):
    db.close_db(exception)


@app.route("/api/health")
def api_health():
    return jsonify({"status": "ok", "time": time.time()})


# ================= AUTH API: LOGIN =================
@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"success": False, "message": "Please enter both email and password."}), 400

    if _is_rate_limited(login_attempt_log, email, LOGIN_MAX_ATTEMPTS, LOGIN_ATTEMPT_WINDOW_SECONDS):
        return jsonify({"success": False, "message": "Too many failed attempts. Please try again in a few minutes."}), 429

    user = db.get_user_by_email(email)
    if not user or not check_password_hash(user["password_hash"], password):
        _record_attempt(login_attempt_log, email)
        db.log_login_attempt(email, client_ip(), success=False)
        return jsonify({"success": False, "message": "Incorrect email or password."}), 401

    _clear_attempts(login_attempt_log, email)
    db.update_last_login(email)
    db.log_login_attempt(email, client_ip(), success=True)

    _prune_expired_tokens()
    token = str(uuid.uuid4())
    now = time.time()
    active_tokens[token] = {"email": email, "created_at": now, "last_seen": now}

    return jsonify({"success": True, "message": "Login successful!", "token": token})


# ================= AUTH API: SIGN UP =================
@app.route("/api/signup/send-otp", methods=["POST"])
def api_signup_send_otp():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name or not email or not password:
        return jsonify({"success": False, "message": "Please fill in all fields."}), 400
    if not EMAIL_REGEX.match(email):
        return jsonify({"success": False, "message": "Please enter a valid email address."}), 400
    if len(password) < MIN_PASSWORD_LENGTH:
        return jsonify({"success": False, "message": f"Password must be at least {MIN_PASSWORD_LENGTH} characters."}), 400
    if db.get_user_by_email(email):
        return jsonify({"success": False, "message": "An account with this email already exists. Please log in."}), 409

    existing = pending_signups.get(email)
    now = time.time()
    if existing and now - existing["last_sent"] < config.OTP_RESEND_COOLDOWN_SECONDS:
        wait = int(config.OTP_RESEND_COOLDOWN_SECONDS - (now - existing["last_sent"]))
        return jsonify({"success": False, "message": f"Please wait {wait} seconds before requesting another code."}), 429

    otp = f"{random.randint(0, 999999):06d}"
    expires_at = now + config.OTP_EXPIRY_SECONDS
    pending_signups[email] = {
        "name": name,
        "password_hash": generate_password_hash(password),
        "otp": otp,
        "expires_at": expires_at,
        "attempts": 0,
        "last_sent": now,
    }
    try:
        send_otp_email(email, otp)
    except Exception:
        return jsonify({"success": False, "message": "Failed to send verification code. Please try again."}), 500

    return jsonify({
        "success": True,
        "message": "Verification code sent. Please check your email.",
        "expires_in": config.OTP_EXPIRY_SECONDS,
        "resend_after": config.OTP_RESEND_COOLDOWN_SECONDS,
    })

@app.route("/api/signup/verify-otp", methods=["POST"])
def api_signup_verify_otp():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    otp = (data.get("otp") or "").strip()

    record = pending_signups.get(email)
    if not record:
        return jsonify({"success": False, "message": "No pending signup found. Please start again."}), 400

    if time.time() > record["expires_at"]:
        pending_signups.pop(email, None)
        return jsonify({"success": False, "message": "This verification code has expired. Please sign up again."}), 400

    record["attempts"] += 1
    if record["attempts"] > OTP_MAX_VERIFY_ATTEMPTS:
        pending_signups.pop(email, None)
        return jsonify({"success": False, "message": "Too many incorrect attempts. Please sign up again."}), 429

    if otp != record["otp"]:
        return jsonify({"success": False, "message": "Incorrect verification code."}), 400

    db.create_user(record["name"], email, record["password_hash"])
    pending_signups.pop(email, None)
    db.update_last_login(email)

    _prune_expired_tokens()
    token = str(uuid.uuid4())
    now = time.time()
    active_tokens[token] = {"email": email, "created_at": now, "last_seen": now}

    return jsonify({"success": True, "message": "Account created — you're logged in!", "token": token})


# ================= API: ME & LOGOUT =================
@app.route("/api/me")
def api_me():
    token = request.headers.get("Authorization")
    if token and token in active_tokens:
        info = active_tokens[token]
        if time.time() - info["created_at"] <= TOKEN_MAX_AGE_SECONDS:
            _touch_presence(token)
            return jsonify({"logged_in": True, "email": info["email"]})
        active_tokens.pop(token, None)
    return jsonify({"logged_in": False})

@app.route("/api/logout", methods=["POST", "GET"])
def api_logout():
    token = request.headers.get("Authorization")
    if token in active_tokens:
        del active_tokens[token]
    return jsonify({"success": True, "message": "Logged out successfully."})


# ================= PROFILE API =================
@app.route("/api/profile", methods=["GET"])
@api_login_required
def api_profile_get():
    user = db.get_user_by_email(request.user_email)
    if not user:
        return jsonify({"success": False, "message": "User not found."}), 404
    return jsonify({
        "success": True,
        "name": user["name"],
        "email": user["email"],
        "avatar": user["avatar"],
        "address": user["address"],
        "created_at": user["created_at"],
    })

@app.route("/api/profile/update", methods=["POST"])
@api_login_required
def api_profile_update():
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    avatar = data.get("avatar")  
    address = data.get("address") 

    if name is not None:
        name = name.strip()
        if not name:
            return jsonify({"success": False, "message": "Name cannot be empty."}), 400
        if len(name) > 80:
            return jsonify({"success": False, "message": "Name is too long."}), 400

    if avatar is not None and len(avatar) > MAX_AVATAR_BASE64_CHARS:
        return jsonify({"success": False, "message": "That image is too large. Please choose a smaller photo."}), 400

    if address is not None:
        address = address.strip()
        if len(address) > 300:
            return jsonify({"success": False, "message": "Address is too long."}), 400

    db.update_profile(request.user_email, name=name, avatar=avatar, address=address)
    return jsonify({"success": True, "message": "Profile updated."})

@app.route("/api/profile/change-password", methods=["POST"])
@api_login_required
def api_profile_change_password():
    data = request.get_json(silent=True) or {}
    current_password = data.get("current_password") or ""
    new_password = data.get("new_password") or ""

    user = db.get_user_by_email(request.user_email)
    if not user or not check_password_hash(user["password_hash"], current_password):
        return jsonify({"success": False, "message": "Current password is incorrect."}), 401
    if len(new_password) < MIN_PASSWORD_LENGTH:
        return jsonify({"success": False, "message": f"New password must be at least {MIN_PASSWORD_LENGTH} characters."}), 400

    db.update_password(request.user_email, generate_password_hash(new_password))
    return jsonify({"success": True, "message": "Password changed successfully."})


# ================= NEW: CHAT SAVE API (WITH SESSION) =================
@app.route("/api/save-chat", methods=["POST"])
@api_login_required
def save_chat():
    data = request.get_json(silent=True) or {}
    user_message = data.get("user_message", "")
    ai_response = data.get("ai_response", "")
    session_id = data.get("session_id", "default_session")

    email = request.user_email
    db.save_chat(email, user_message, ai_response, source="ai", session_id=session_id)
    return jsonify({"success": True})


# ================= NEW: PERSISTENT CROSS-DEVICE CHAT MEMORY =================
@app.route("/api/chat-history", methods=["GET"])
@api_login_required
def api_chat_history():
    session_id = request.args.get("session_id", "default_session")
    rows = db.get_chats_for_session(request.user_email, session_id, limit=CHAT_HISTORY_LIMIT)
    history = []
    for r in rows:
        if r["source"] == "admin":
            history.append({"role": "model", "parts": [{"text": r["ai_response"]}]})
        else:
            if r["user_message"]:
                history.append({"role": "user", "parts": [{"text": r["user_message"]}]})
            if r["ai_response"]:
                history.append({"role": "model", "parts": [{"text": r["ai_response"]}]})
    return jsonify({"success": True, "history": history})


# ================= NEW: SIDEBAR CHAT SESSIONS API =================
@app.route("/api/chat-sessions", methods=["GET"])
@api_login_required
def api_chat_sessions():
    rows = db.get_chat_sessions(request.user_email)
    sessions = [
        {
            "session_id": r["session_id"],
            "title": r["title"] or "New Conversation",
            "last_updated": r["last_updated"]
        }
        for r in rows
    ]
    return jsonify({"success": True, "sessions": sessions})


# ================= ADMIN -> USER LIVE MESSAGE CHANNEL =================
@app.route("/api/check-messages", methods=["GET"])
@api_login_required
def api_check_messages():
    try:
        since_id = int(request.args.get("since_id", 0))
    except (TypeError, ValueError):
        since_id = 0

    rows = db.get_new_admin_messages(request.user_email, since_id)
    messages = [{"id": r["id"], "text": r["ai_response"], "timestamp": r["timestamp"]} for r in rows]
    return jsonify({"success": True, "messages": messages})


# ================= PUSH NOTIFICATIONS (admin -> user) =================
@app.route("/api/push/vapid-public-key", methods=["GET"])
def api_push_vapid_public_key():
    if not PUSH_ENABLED:
        return jsonify({"success": False, "message": "Push notifications are not configured on this server."}), 503
    return jsonify({"success": True, "publicKey": VAPID_PUBLIC_KEY})

@app.route("/api/push/subscribe", methods=["POST"])
@api_login_required
def api_push_subscribe():
    if not PUSH_ENABLED:
        return jsonify({"success": False, "message": "Push notifications are not configured on this server."}), 503

    data = request.get_json(silent=True) or {}
    endpoint = (data.get("endpoint") or "").strip()
    keys = data.get("keys") or {}
    p256dh = (keys.get("p256dh") or "").strip()
    auth = (keys.get("auth") or "").strip()

    if not endpoint or not p256dh or not auth:
        return jsonify({"success": False, "message": "Incomplete push subscription."}), 400

    db.save_push_subscription(request.user_email, endpoint, p256dh, auth)
    return jsonify({"success": True})

@app.route("/api/push/unsubscribe", methods=["POST"])
@api_login_required
def api_push_unsubscribe():
    data = request.get_json(silent=True) or {}
    endpoint = (data.get("endpoint") or "").strip()
    if endpoint:
        db.delete_push_subscription(endpoint)
    return jsonify({"success": True})


# ================= DIRECT USER <-> ADMIN CHAT =================
@app.route("/api/admin-chat/send", methods=["POST"])
@api_login_required
def api_admin_chat_send():
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify({"success": False, "message": "Message cannot be empty."}), 400
    if len(message) > 4000:
        return jsonify({"success": False, "message": "Message is too long."}), 400

    new_id = db.save_admin_chat_message(request.user_email, "user", message)
    return jsonify({"success": True, "id": new_id})

@app.route("/api/admin-chat/messages", methods=["GET"])
@api_login_required
def api_admin_chat_messages():
    try:
        since_id = int(request.args.get("since_id", 0))
    except (TypeError, ValueError):
        since_id = 0

    rows = db.get_admin_chat_messages(request.user_email, since_id)
    messages = [
        {"id": r["id"], "sender": r["sender"], "message": r["message"], "timestamp": r["timestamp"]}
        for r in rows
    ]
    return jsonify({"success": True, "messages": messages})

@app.route("/admin/api/admin-chat-threads", methods=["GET"])
@admin_api_required
def admin_api_chat_threads():
    users_by_email = {u["email"]: u["name"] for u in db.get_all_users()}
    threads = [
        {
            "email": t["user_email"],
            "name": users_by_email.get(t["user_email"], t["user_email"]),
            "last_message": t["last_message"],
            "last_sender": t["last_sender"],
            "last_timestamp": t["last_timestamp"],
            "unread_count": t["unread_count"] or 0,
        }
        for t in db.get_admin_chat_threads()
    ]
    return jsonify({"success": True, "threads": threads})

@app.route("/admin/api/admin-chat/<path:email>", methods=["GET"])
@admin_api_required
def admin_api_chat_thread(email):
    email = email.strip().lower()
    rows = db.get_admin_chat_messages(email, 0)
    db.mark_admin_chat_read(email)
    messages = [
        {"id": r["id"], "sender": r["sender"], "message": r["message"], "timestamp": r["timestamp"]}
        for r in rows
    ]
    return jsonify({"success": True, "email": email, "messages": messages})

@app.route("/admin/api/admin-chat/reply", methods=["POST"])
@admin_api_required
def admin_api_chat_reply():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    message = (data.get("message") or "").strip()

    if not email or not message:
        return jsonify({"success": False, "message": "Both email and message are required."}), 400
    if not db.get_user_by_email(email):
        return jsonify({"success": False, "message": "No such user exists."}), 404

    new_id = db.save_admin_chat_message(email, "admin", message)

    send_push_to_user(
        email,
        title="New message from Beyonder AI Support",
        body=message[:150],
    )

    return jsonify({"success": True, "id": new_id})


# ================= ADMIN PANEL =================
@app.route("/admin", methods=["GET"])
def admin_home():
    if session.get("is_admin"):
        chat_threads = db.get_admin_chat_threads()
        unread_total = sum((t["unread_count"] or 0) for t in chat_threads)
        return render_template(
            "admin_dashboard.html",
            users=db.get_all_users(),
            chats=db.get_all_chats(),
            logs=db.get_all_login_logs(),
            online_count=len(get_online_users()),
            unread_total=unread_total,
        )
    return render_template("admin_login.html")

@app.route("/admin/login", methods=["POST"])
def admin_login():
    ip = client_ip()
    if _is_rate_limited(admin_login_attempt_log, ip, LOGIN_MAX_ATTEMPTS, LOGIN_ATTEMPT_WINDOW_SECONDS):
        return render_template("admin_login.html", error="Too many failed attempts. Please try again later.")

    if request.form.get("password", "") == config.ADMIN_PASSWORD:
        _clear_attempts(admin_login_attempt_log, ip)
        session.permanent = True
        session["is_admin"] = True
        return redirect(url_for("admin_home"))

    _record_attempt(admin_login_attempt_log, ip)
    return render_template("admin_login.html", error="Incorrect password.")

@app.route("/admin/logout")
def admin_logout():
    session.pop("is_admin", None)
    return redirect(url_for("admin_home"))

@app.route("/admin/delete-user", methods=["POST"])
@admin_required
def admin_delete_user():
    email = request.form.get("email", "")
    if email:
        db.delete_user(email)
    return redirect(url_for("admin_home"))


# ================= ADMIN JSON APIs =================
@app.route("/admin/api/online-users", methods=["GET"])
@admin_api_required
def admin_api_online_users():
    online = get_online_users()
    users_by_email = {u["email"]: u["name"] for u in db.get_all_users()}
    result = [
        {
            "email": email,
            "name": users_by_email.get(email, email),
            "last_seen": last_seen,
        }
        for email, last_seen in online.items()
    ]
    result.sort(key=lambda u: u["last_seen"], reverse=True)
    return jsonify({"success": True, "online_users": result, "count": len(result)})

@app.route("/admin/api/user-chats/<path:email>", methods=["GET"])
@admin_api_required
def admin_api_user_chats(email):
    email = email.strip().lower()
    rows = db.get_chats_for_user(email, limit=500)
    chats = [
        {
            "id": r["id"],
            "user_message": r["user_message"],
            "ai_response": r["ai_response"],
            "timestamp": r["timestamp"],
            "source": r["source"],
        }
        for r in rows
    ]
    return jsonify({"success": True, "email": email, "chats": chats})

@app.route("/admin/api/send-message", methods=["POST"])
@admin_api_required
def admin_api_send_message():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    message = (data.get("message") or "").strip()

    if not email or not message:
        return jsonify({"success": False, "message": "Both email and message are required."}), 400
    if not db.get_user_by_email(email):
        return jsonify({"success": False, "message": "No such user exists."}), 404

    new_id = db.save_admin_message(email, message)

    send_push_to_user(
        email,
        title="New message from Beyonder AI",
        body=message[:150],
    )

    return jsonify({"success": True, "id": new_id})

@app.route("/admin/api/login-as-user", methods=["POST"])
@admin_api_required
def admin_login_as_user():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"success": False, "message": "Email is required."}), 400
    if not db.get_user_by_email(email):
        return jsonify({"success": False, "message": "No such user exists."}), 404

    _prune_expired_tokens()
    token = str(uuid.uuid4())
    now = time.time()
    active_tokens[token] = {"email": email, "created_at": now, "last_seen": now}
    db.log_login_attempt(email, "admin-impersonation", success=True)

    return jsonify({"success": True, "token": token, "email": email})

@app.route("/admin/api/purge-old-data", methods=["POST"])
@admin_api_required
def admin_purge_old_data():
    data = request.get_json(silent=True) or {}
    try:
        days = int(data.get("days", 180))
    except (TypeError, ValueError):
        days = 180
    days = max(1, days)

    result = db.purge_old_data(days=days)
    return jsonify({"success": True, "deleted": result})

@app.route("/admin/api/kill-switch", methods=["POST"])
@admin_api_required
def admin_kill_switch():
    if not KILL_SWITCH_PASSWORD:
        return jsonify({
            "success": False,
            "message": "Kill switch is not configured. Add KILL_SWITCH_PASSWORD to config.py to enable it."
        }), 500

    data = request.get_json(silent=True) or {}
    password = data.get("password") or ""
    confirm_text = (data.get("confirm_text") or "").strip()

    if confirm_text != KILL_SWITCH_CONFIRM_PHRASE:
        return jsonify({
            "success": False,
            "message": f'Type "{KILL_SWITCH_CONFIRM_PHRASE}" exactly to confirm.'
        }), 400

    if password != KILL_SWITCH_PASSWORD:
        return jsonify({"success": False, "message": "Incorrect kill switch password."}), 401

    try:
        with open("kill_switch_audit.log", "a") as f:
            f.write(f"{datetime.now(tz=IST).isoformat()} — KILL SWITCH TRIGGERED from IP {client_ip()}\n")
    except Exception:
        pass

    db.kill_switch_wipe_everything()

    active_tokens.clear()
    pending_signups.clear()
    reset_otp_store.clear()
    login_attempt_log.clear()
    admin_login_attempt_log.clear()

    session.pop("is_admin", None)

    return jsonify({"success": True, "message": "Database wiped. All accounts, chats, and logs have been deleted."})


# ================= AUTH API: FORGOT PASSWORD =================
@app.route("/api/forgot-password/send-otp", methods=["POST"])
def api_forgot_send_otp():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    if not email or not EMAIL_REGEX.match(email):
        return jsonify({"success": False, "message": "Please enter a valid email address."}), 400

    user = db.get_user_by_email(email)
    if not user:
        return jsonify({"success": True, "message": "If this email is registered, a verification code has been sent."})

    existing = reset_otp_store.get(email)
    now = time.time()
    if existing and now - existing["last_sent"] < config.OTP_RESEND_COOLDOWN_SECONDS:
        wait = int(config.OTP_RESEND_COOLDOWN_SECONDS - (now - existing["last_sent"]))
        return jsonify({"success": False, "message": f"Please wait {wait} seconds before requesting another code."}), 429

    otp = f"{random.randint(0, 999999):06d}"
    reset_otp_store[email] = {
        "otp": otp,
        "expires_at": now + config.OTP_EXPIRY_SECONDS,
        "attempts": 0,
        "last_sent": now,
    }
    try:
        send_otp_email(email, otp, purpose="reset")
    except Exception:
        return jsonify({"success": False, "message": "Failed to send verification code. Please try again."}), 500

    return jsonify({
        "success": True,
        "message": "If this email is registered, a verification code has been sent.",
        "expires_in": config.OTP_EXPIRY_SECONDS,
        "resend_after": config.OTP_RESEND_COOLDOWN_SECONDS,
    })

@app.route("/api/forgot-password/reset", methods=["POST"])
def api_forgot_reset():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    otp = (data.get("otp") or "").strip()
    new_password = data.get("new_password") or ""

    record = reset_otp_store.get(email)
    if not record:
        return jsonify({"success": False, "message": "Please request a verification code first."}), 400
    if time.time() > record["expires_at"]:
        reset_otp_store.pop(email, None)
        return jsonify({"success": False, "message": "This verification code has expired."}), 400

    record["attempts"] += 1
    if record["attempts"] > OTP_MAX_VERIFY_ATTEMPTS:
        reset_otp_store.pop(email, None)
        return jsonify({"success": False, "message": "Too many incorrect attempts. Please request a new code."}), 429

    if otp != record["otp"]:
        return jsonify({"success": False, "message": "Incorrect verification code."}), 400
    if len(new_password) < MIN_PASSWORD_LENGTH:
        return jsonify({"success": False, "message": f"Password must be at least {MIN_PASSWORD_LENGTH} characters long."}), 400

    user = db.get_user_by_email(email)
    if not user:
        reset_otp_store.pop(email, None)
        return jsonify({"success": False, "message": "No account exists with this email."}), 404

    db.update_password(email, generate_password_hash(new_password))
    reset_otp_store.pop(email, None)

    return jsonify({"success": True, "message": "Password updated successfully. Please log in."})


# ================= NEW: SECURE WEBHOOK API =================
@app.route("/api/webhook", methods=["POST"])
def api_webhook():
    """Secure Webhook endpoint. Checks against WEBHOOK_SECRET in config.py"""
    secret = getattr(config, "WEBHOOK_SECRET", None)
    
    # Allows secret to be passed via headers (X-Webhook-Secret) or URL parameter (?secret=...)
    provided_secret = request.headers.get("X-Webhook-Secret") or request.args.get("secret")
    
    if not secret or provided_secret != secret:
        return jsonify({"success": False, "message": "Unauthorized access. Invalid or missing webhook secret."}), 401
    
    data = request.get_json(silent=True) or {}
    
    return jsonify({"success": True, "message": "Webhook received successfully", "payload": data})


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1", port=5000)