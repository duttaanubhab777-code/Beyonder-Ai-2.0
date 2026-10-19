"""Login, sessions (tokens) and admin detection."""
from __future__ import annotations

import time

from werkzeug.security import check_password_hash

from beyonder.database import app_settings, auth_tokens, login_logs, users
from beyonder.settings import get_settings

from . import housekeeping, rate_limit, security


class AuthError(Exception):
    def __init__(self, message, status=401):
        super().__init__(message)
        self.message = message
        self.status = status


def is_admin(email):
    return bool(email) and email.lower() in get_settings().ADMIN_EMAILS


def maintenance_blocks(email):
    return app_settings.get("maintenance_mode") == "1" and not is_admin(email)


def issue_session(email, ip, ua, impersonated_by=None):
    s = get_settings()
    housekeeping.maybe_run()
    now = time.time()
    lifetime = s.IMPERSONATION_MAX_AGE_SECONDS if impersonated_by else s.TOKEN_MAX_AGE_SECONDS
    raw = security.new_token()
    auth_tokens.insert(security.hash_token(raw), email, now, now + lifetime, ip, ua, impersonated_by)
    return raw


def login(email, password, ip, ua):
    s = get_settings()
    email_bucket = f"login:email:{email}"
    ip_bucket = f"login:ip:{ip}"

    if (rate_limit.is_limited(email_bucket, s.LOGIN_MAX_ATTEMPTS, s.LOGIN_ATTEMPT_WINDOW_SECONDS)
            or rate_limit.is_limited(ip_bucket, s.LOGIN_MAX_ATTEMPTS * 4, s.LOGIN_ATTEMPT_WINDOW_SECONDS)):
        raise AuthError("Too many failed attempts. Please try again in a few minutes.", 429)

    user = users.get_by_email(email)
    if not user or not check_password_hash(user["password_hash"], password):
        rate_limit.record(email_bucket)
        rate_limit.record(ip_bucket)
        login_logs.log(email, ip, success=False, user_agent=ua, note="wrong credentials")
        raise AuthError("Incorrect email or password.", 401)

    if user["is_banned"]:
        login_logs.log(email, ip, success=False, user_agent=ua, note="banned account")
        reason = (user["ban_reason"] or "").strip()
        msg = "This account has been suspended."
        if reason:
            msg += f" Reason: {reason}"
        raise AuthError(msg, 403)

    if maintenance_blocks(email):
        raise AuthError(app_settings.get("maintenance_message"), 503)

    rate_limit.clear(email_bucket)
    users.update_last_login(email)
    login_logs.log(email, ip, success=True, user_agent=ua)
    return user, issue_session(email, ip, ua)


def resolve(raw_token):
    if not raw_token:
        return None
    raw = raw_token.strip()
    if raw.lower().startswith("bearer "):
        raw = raw[7:].strip()
    if not raw:
        return None

    token_hash = security.hash_token(raw)
    row = auth_tokens.get(token_hash)
    if not row:
        return None

    now = time.time()
    if row["expires_at"] < now:
        auth_tokens.delete(token_hash)
        return None

    user = users.get_by_email(row["user_email"])
    if not user or user["is_banned"]:
        auth_tokens.delete(token_hash)
        return None

    if now - row["last_seen"] > 20:
        auth_tokens.touch(token_hash, now)

    return {
        "email": user["email"],
        "user": user,
        "token_hash": token_hash,
        "impersonated_by": row["impersonated_by"],
        "is_admin": is_admin(user["email"]),
    }


def revoke(raw_token):
    session = resolve(raw_token)
    if session:
        auth_tokens.delete(session["token_hash"])
