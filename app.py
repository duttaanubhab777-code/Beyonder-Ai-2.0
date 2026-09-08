from flask import Flask, request, jsonify, session, render_template, redirect, url_for
from flask_cors import CORS
import smtplib
from email.mime.text import MIMEText
import random
import time
import subprocess
import re
import os
import uuid  # <-- নতুন ইমপোর্ট (টোকেন বানানোর জন্য)
from datetime import datetime
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash

import config
import db

app = Flask(__name__)
app.secret_key = config.SECRET_KEY

# ================= ২. Cross-Domain (CORS) সেটিংস =================
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "None"
app.config["SESSION_COOKIE_SECURE"] = True
app.permanent_session_lifetime = 60 * 60 * 24 * 7

# CORS-এ Authorization হেডার অ্যালাও করা হলো
CORS(app, supports_credentials=True, origins=["https://duttaanubhab777-code.github.io"], allow_headers=["Content-Type", "Authorization"])
# ========================================================================

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
CHAT_LOG_FILE = "chat_history.json"
db.init_db()

pending_signups = {}
reset_otp_store = {}

# ================= নতুন টোকেন স্টোর =================
active_tokens = {}  # এখানে লগইন করা ইউজারদের টোকেন সেভ থাকবে

def send_otp_email(to_email, otp, purpose="login"):
    subject = "Your Beyonder AI Verification Code"
    body = f"Hello,\n\nYour one-time verification code for Beyonder AI is:\n\n    {otp}\n\nThis code will expire in {config.OTP_EXPIRY_SECONDS // 60} minutes.\n\n— Beyonder AI"
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = config.GMAIL_ADDRESS
    msg["To"] = to_email

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(config.GMAIL_ADDRESS, config.GMAIL_APP_PASSWORD)
        server.sendmail(config.GMAIL_ADDRESS, [to_email], msg.as_string())


# ৩. নতুন API ডেকোরেটর (এখন কুকির বদলে টোকেন চেক করবে)
def api_login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        token = request.headers.get("Authorization")
        if not token or token not in active_tokens:
            return jsonify({"success": False, "message": "লগইন প্রয়োজন।"}), 401

        request.user_email = active_tokens[token] # ইমেইলটা রিকোয়েস্টের সাথে জুড়ে দিলাম
        return view(*args, **kwargs)
    return wrapped

def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("is_admin"):
            return redirect(url_for("admin_home"))
        return view(*args, **kwargs)
    return wrapped

@app.template_filter("datetimeformat")
def datetimeformat(value):
    try:
        return datetime.fromtimestamp(value).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return "-"

def client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


# ================= AUTH API: LOGIN =================
@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"success": False, "message": "ইমেইল এবং পাসওয়ার্ড দিন।"}), 400

    user = db.get_user_by_email(email)
    if not user or not check_password_hash(user["password_hash"], password):
        db.log_login_attempt(email, client_ip(), success=False)
        return jsonify({"success": False, "message": "ইমেইল অথবা পাসওয়ার্ড ভুল।"}), 401

    db.update_last_login(email)
    db.log_login_attempt(email, client_ip(), success=True)

    # কুকির বদলে নতুন টোকেন তৈরি করা হলো
    token = str(uuid.uuid4())
    active_tokens[token] = email

    return jsonify({"success": True, "message": "লগইন সফল হয়েছে!", "token": token})


# ================= AUTH API: SIGN UP =================
@app.route("/api/signup/send-otp", methods=["POST"])
def api_signup_send_otp():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name or not email or not password:
        return jsonify({"success": False, "message": "সব ফিল্ড পূরণ করুন।"}), 400
    if not EMAIL_REGEX.match(email):
        return jsonify({"success": False, "message": "সঠিক ইমেইল ঠিকানা দিন।"}), 400
    if db.get_user_by_email(email):
        return jsonify({"success": False, "message": "অ্যাকাউন্ট আছে, লগইন করুন।"}), 409

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
    except Exception as e:
        return jsonify({"success": False, "message": "Failed to send verification code. Please try again."}), 500

    return jsonify({"success": True, "message": "Verification code sent. Please check your email.", "expires_in": config.OTP_EXPIRY_SECONDS, "resend_after": config.OTP_RESEND_COOLDOWN_SECONDS})

@app.route("/api/signup/verify-otp", methods=["POST"])
def api_signup_verify_otp():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    otp = (data.get("otp") or "").strip()

    record = pending_signups.get(email)
    if not record or otp != record["otp"]:
        return jsonify({"success": False, "message": "ভুল OTP বা সেশন শেষ।"}), 400

    db.create_user(record["name"], email, record["password_hash"])
    pending_signups.pop(email, None)
    db.update_last_login(email)

    token = str(uuid.uuid4())
    active_tokens[token] = email

    return jsonify({"success": True, "message": "লগইন হয়ে গেছেন!", "token": token})


# ================= API: ME & LOGOUT =================
@app.route("/api/me")
def api_me():
    token = request.headers.get("Authorization")
    if token and token in active_tokens:
        return jsonify({"logged_in": True, "email": active_tokens[token]})
    return jsonify({"logged_in": False})

@app.route("/api/logout", methods=["POST", "GET"])
def api_logout():
    token = request.headers.get("Authorization")
    if token in active_tokens:
        del active_tokens[token] # টোকেন মুছে ফেলা হলো
    return jsonify({"success": True, "message": "লগআউট সফল!"})


# ================= CHAT SAVE API =================
@app.route("/api/save-chat", methods=["POST"])
@api_login_required
def save_chat():
    data = request.get_json(silent=True) or {}
    user_message = data.get("user_message", "")
    ai_response = data.get("ai_response", "")

    email = getattr(request, "user_email", "unknown")
    db.save_chat(email, user_message, ai_response)
    return jsonify({"success": True})

# ================= হিডেন এডমিন প্যানেল =================
@app.route("/admin", methods=["GET"])
def admin_home():
    if session.get("is_admin"):
        return render_template("admin_dashboard.html", users=db.get_all_users(), chats=db.get_all_chats(), logs=db.get_all_login_logs())
    return render_template("admin_login.html")

@app.route("/admin/login", methods=["POST"])
def admin_login():
    if request.form.get("password", "") == config.ADMIN_PASSWORD:
        session["is_admin"] = True
        return redirect(url_for("admin_home"))
    return render_template("admin_login.html", error="ভুল পাসওয়ার্ড।")

@app.route("/admin/logout")
def admin_logout():
    session.pop("is_admin", None)
    return redirect(url_for("admin_home"))


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
    except Exception as e:
        return jsonify({"success": False, "message": "Failed to send verification code. Please try again."}), 500

    return jsonify({"success": True, "message": "If this email is registered, a verification code has been sent.", "expires_in": config.OTP_EXPIRY_SECONDS, "resend_after": config.OTP_RESEND_COOLDOWN_SECONDS})


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
    if record["attempts"] > 5:
        reset_otp_store.pop(email, None)
        return jsonify({"success": False, "message": "Too many incorrect attempts. Please request a new code."}), 429

    if otp != record["otp"]:
        return jsonify({"success": False, "message": "Incorrect verification code."}), 400
    if len(new_password) < 8:
        return jsonify({"success": False, "message": "Password must be at least 8 characters long."}), 400

    user = db.get_user_by_email(email)
    if not user:
        reset_otp_store.pop(email, None)
        return jsonify({"success": False, "message": "No account exists with this email."}), 404

    db.update_password(email, generate_password_hash(new_password))
    reset_otp_store.pop(email, None)

    return jsonify({"success": True, "message": "Password updated successfully. Please log in."})


# ================= ADMIN: DELETE USER =================
@app.route("/admin/delete-user", methods=["POST"])
@admin_required
def admin_delete_user():
    email = request.form.get("email", "")
    if email:
        db.delete_user(email)
    return redirect(url_for("admin_home"))

if __name__ == "__main__":
    app.run(debug=True, port=5000)
