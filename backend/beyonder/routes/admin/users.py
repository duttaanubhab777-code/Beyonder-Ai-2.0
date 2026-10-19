from __future__ import annotations

import json
import secrets
import time

from flask import Response, g, request
from sqlite3 import IntegrityError
from werkzeug.security import generate_password_hash

from beyonder.database import (auth_tokens, chats, login_logs, notifications, push_subscriptions,
                               support, users)
from beyonder.middleware.auth import admin_required
from beyonder.services import auth_service, push_service
from beyonder.settings import get_settings
from beyonder.utils.request_info import client_ip, user_agent
from beyonder.utils.responses import fail, ok
from beyonder.utils.validators import clean_email, clean_text, is_valid_email

from . import admin_bp
from .helpers import page_args, record, user_dict


def _find(email):
    return users.get_by_email(clean_email(email))


@admin_bp.get("/users")
@admin_required
def list_users():
    page, per_page, offset = page_args()
    q = clean_text(request.args.get("q", ""), 100)
    flt = request.args.get("filter", "")
    banned = True if flt == "banned" else None
    rows = users.search_users(q, banned, per_page, offset)
    return ok(
        users=[user_dict(r) for r in rows],
        total=users.count_users(q, banned), page=page, per_page=per_page,
    )


@admin_bp.post("/users")
@admin_required
def create_user():
    s = get_settings()
    data = request.get_json(silent=True) or {}
    name = clean_text(data.get("name"), 80)
    email = clean_email(data.get("email"))
    password = data.get("password") if isinstance(data.get("password"), str) else ""
    if not name or not is_valid_email(email):
        return fail("A name and a valid email are required.")
    if not (s.MIN_PASSWORD_LENGTH <= len(password) <= s.MAX_PASSWORD_LENGTH):
        return fail(f"Password must be {s.MIN_PASSWORD_LENGTH}-{s.MAX_PASSWORD_LENGTH} characters.")
    try:
        users.create_user(name, email, generate_password_hash(password))
    except IntegrityError:
        return fail("A user with this email already exists.", 409)
    record("user.create", email)
    return ok("User created.")


@admin_bp.get("/users/<email>")
@admin_required
def user_detail(email):
    user = _find(email)
    if not user:
        return fail("No such user.", 404)
    now = time.time()
    detail = user_dict(user)
    detail["avatar"] = user["avatar"]
    detail["sessions"] = [
        {"id": t["token_hash"][:16], "created_at": t["created_at"], "last_seen": t["last_seen"],
         "ip": t["ip_address"], "user_agent": t["user_agent"],
         "impersonated_by": t["impersonated_by"]}
        for t in auth_tokens.list_for_user(user["email"], now)
    ]
    detail["recent_logins"] = [
        {"timestamp": r["timestamp"], "ip": r["ip_address"], "success": bool(r["success"]),
         "note": r["note"], "user_agent": r["user_agent"]}
        for r in login_logs.recent_for_user(user["email"], 10)
    ]
    detail["push_devices"] = len(push_subscriptions.for_user(user["email"]))
    detail["support_messages"] = len(support.messages(user["email"], 0))
    detail["chat_sessions"] = len(chats.sessions(user["email"]))
    return ok(user=detail)


@admin_bp.post("/users/<email>/update")
@admin_required
def update_user(email):
    user = _find(email)
    if not user:
        return fail("No such user.", 404)
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    if name is not None:
        name = clean_text(name, 80)
        if not name:
            return fail("Name cannot be empty.")
    address = clean_text(data["address"], 300) if "address" in data else None
    users.update_profile(user["email"], name=name, address=address)
    if "admin_note" in data:
        users.set_admin_note(user["email"], clean_text(data["admin_note"], 1000))
    record("user.update", user["email"])
    return ok("User updated.")


@admin_bp.post("/users/<email>/ban")
@admin_required
def ban_user(email):
    user = _find(email)
    if not user:
        return fail("No such user.", 404)
    if user["email"] == g.user_email:
        return fail("You can't ban yourself.")
    data = request.get_json(silent=True) or {}
    banned = bool(data.get("banned", True))
    reason = clean_text(data.get("reason", ""), 200)
    users.set_banned(user["email"], banned, reason)
    if banned:
        auth_tokens.delete_for_user(user["email"])
    record("user.ban" if banned else "user.unban", user["email"], reason)
    return ok("User banned and signed out." if banned else "User unbanned.")


@admin_bp.post("/users/<email>/reset-password")
@admin_required
def reset_password(email):
    s = get_settings()
    user = _find(email)
    if not user:
        return fail("No such user.", 404)
    data = request.get_json(silent=True) or {}
    new_password = data.get("new_password") if isinstance(data.get("new_password"), str) else ""
    generated = False
    if not new_password:
        new_password = secrets.token_urlsafe(9)
        generated = True
    if not (s.MIN_PASSWORD_LENGTH <= len(new_password) <= s.MAX_PASSWORD_LENGTH):
        return fail(f"Password must be {s.MIN_PASSWORD_LENGTH}-{s.MAX_PASSWORD_LENGTH} characters.")
    users.update_password(user["email"], generate_password_hash(new_password))
    auth_tokens.delete_for_user(user["email"])
    record("user.reset_password", user["email"], "generated" if generated else "custom")
    return ok("Password reset. The user was signed out everywhere.",
              password=new_password if generated else None)


@admin_bp.post("/users/<email>/logout")
@admin_required
def force_logout(email):
    user = _find(email)
    if not user:
        return fail("No such user.", 404)
    n = auth_tokens.delete_for_user(user["email"])
    record("user.force_logout", user["email"], f"{n} sessions")
    return ok(f"Signed out {n} session(s).", count=n)


@admin_bp.post("/users/<email>/impersonate")
@admin_required
def impersonate(email):
    user = _find(email)
    if not user:
        return fail("No such user.", 404)
    if user["is_banned"]:
        return fail("This user is banned. Unban first.")
    token = auth_service.issue_session(user["email"], client_ip(), user_agent(),
                                       impersonated_by=g.user_email)
    login_logs.log(user["email"], client_ip(), True, user_agent(), f"impersonated by {g.user_email}")
    record("user.impersonate", user["email"])
    return ok(token=token, email=user["email"],
              expires_in=get_settings().IMPERSONATION_MAX_AGE_SECONDS)


@admin_bp.post("/users/<email>/message")
@admin_required
def message_user(email):
    user = _find(email)
    if not user:
        return fail("No such user.", 404)
    data = request.get_json(silent=True) or {}
    message = clean_text(data.get("message"), 4000)
    if not message:
        return fail("Message cannot be empty.")
    notifications.add(user["email"], message)
    pushed = push_service.send_to_user(user["email"], "New message from Beyonder AI", message)
    record("user.message", user["email"], message[:120])
    return ok("Message sent.", pushed=pushed)


@admin_bp.get("/users/<email>/export")
@admin_required
def export_user(email):
    user = _find(email)
    if not user:
        return fail("No such user.", 404)
    em = user["email"]
    payload = {
        "exported_at": time.time(),
        "user": {k: user[k] for k in ("name", "email", "created_at", "last_login_at", "address",
                                      "is_banned", "ban_reason", "admin_note")},
        "chats": [dict(r) for r in chats.search(email=em, limit=100000, newest_first=False)],
        "support_messages": [dict(r) for r in support.messages(em, 0)],
        "logins": [dict(r) for r in login_logs.recent(email=em, limit=1000)],
    }
    record("user.export", em)
    return Response(
        json.dumps(payload, ensure_ascii=False, indent=2),
        mimetype="application/json",
        headers={"Content-Disposition": f'attachment; filename="user-{em}.json"'},
    )


@admin_bp.delete("/users/<email>")
@admin_required
def delete_user(email):
    user = _find(email)
    if not user:
        return fail("No such user.", 404)
    if user["email"] == g.user_email:
        return fail("You can't delete your own account here.")
    users.delete_user(user["email"])
    record("user.delete", user["email"])
    return ok("User and all their data were deleted.")
