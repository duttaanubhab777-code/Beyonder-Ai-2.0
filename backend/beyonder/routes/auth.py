"""Login, signup (with e-mail OTP), logout, forgot password."""
from __future__ import annotations

from flask import Blueprint, g, request
from sqlite3 import IntegrityError
from werkzeug.security import generate_password_hash

from beyonder.database import app_settings, auth_tokens, login_logs, users
from beyonder.middleware.auth import login_required
from beyonder.services import auth_service, otp_service
from beyonder.settings import get_settings
from beyonder.utils.request_info import client_ip, user_agent
from beyonder.utils.responses import fail, ok
from beyonder.utils.validators import clean_email, clean_text, is_valid_email

bp = Blueprint("auth", __name__, url_prefix="/api")


def _password_problem(password):
    s = get_settings()
    if len(password) < s.MIN_PASSWORD_LENGTH:
        return f"Password must be at least {s.MIN_PASSWORD_LENGTH} characters."
    if len(password) > s.MAX_PASSWORD_LENGTH:
        return "Password is too long."
    return None


def _session_payload(email, token, user):
    return {
        "token": token,
        "email": email,
        "name": user["name"],
        "is_admin": auth_service.is_admin(email),
    }


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = clean_email(data.get("email"))
    password = data.get("password") if isinstance(data.get("password"), str) else ""
    if not email or not password:
        return fail("Please enter both email and password.")

    try:
        user, token = auth_service.login(email, password, client_ip(), user_agent())
    except auth_service.AuthError as exc:
        return fail(exc.message, exc.status)

    return ok("Login successful!", **_session_payload(email, token, user))


@bp.post("/signup/send-otp")
def signup_send_otp():
    data = request.get_json(silent=True) or {}
    name = clean_text(data.get("name"), 80)
    email = clean_email(data.get("email"))
    password = data.get("password") if isinstance(data.get("password"), str) else ""

    if app_settings.get("registration_open") != "1":
        return fail("New sign-ups are currently closed.", 403)
    if auth_service.maintenance_blocks(email):
        return fail(app_settings.get("maintenance_message"), 503)
    if not name or not email or not password:
        return fail("Please fill in all fields.")
    if not is_valid_email(email):
        return fail("Please enter a valid email address.")
    problem = _password_problem(password)
    if problem:
        return fail(problem)
    if users.get_by_email(email):
        return fail("An account with this email already exists. Please log in.", 409)

    try:
        info = otp_service.issue(
            "signup", email, client_ip(),
            payload={"name": name, "password_hash": generate_password_hash(password)},
        )
    except otp_service.OtpError as exc:
        return fail(exc.message, exc.status)

    return ok("Verification code sent. Please check your email.", **info)


@bp.post("/signup/verify-otp")
def signup_verify_otp():
    data = request.get_json(silent=True) or {}
    email = clean_email(data.get("email"))
    code = clean_text(data.get("otp"), 12)

    try:
        payload = otp_service.verify("signup", email, code)
    except otp_service.OtpError as exc:
        return fail(exc.message, exc.status)

    try:
        users.create_user(payload["name"], email, payload["password_hash"])
    except IntegrityError:
        return fail("An account with this email already exists. Please log in.", 409)

    users.update_last_login(email)
    login_logs.log(email, client_ip(), success=True, user_agent=user_agent(), note="signup")
    token = auth_service.issue_session(email, client_ip(), user_agent())
    user = users.get_by_email(email)
    return ok("Account created - you're logged in!", **_session_payload(email, token, user))


@bp.get("/me")
def me():
    session = auth_service.resolve(request.headers.get("Authorization", ""))
    if not session:
        return ok(logged_in=False)
    user = session["user"]
    return ok(
        logged_in=True,
        email=session["email"],
        name=user["name"],
        is_admin=session["is_admin"],
        impersonated=bool(session["impersonated_by"]),
    )


@bp.post("/logout")
def logout():
    auth_service.revoke(request.headers.get("Authorization", ""))
    return ok("Logged out successfully.")


@bp.post("/logout-all")
@login_required
def logout_all():
    n = auth_tokens.delete_for_user(g.user_email, keep_hash=g.token_hash)
    return ok(f"Signed out {n} other device(s).", count=n)


@bp.post("/forgot-password/send-otp")
def forgot_send_otp():
    data = request.get_json(silent=True) or {}
    email = clean_email(data.get("email"))
    if not is_valid_email(email):
        return fail("Please enter a valid email address.")

    generic = "If this email is registered, a verification code has been sent."
    if not users.get_by_email(email):
        return ok(generic, expires_in=get_settings().OTP_EXPIRY_SECONDS,
                  resend_after=get_settings().OTP_RESEND_COOLDOWN_SECONDS)

    try:
        info = otp_service.issue("reset", email, client_ip())
    except otp_service.OtpError as exc:
        return fail(exc.message, exc.status)
    return ok(generic, **info)


@bp.post("/forgot-password/reset")
def forgot_reset():
    data = request.get_json(silent=True) or {}
    email = clean_email(data.get("email"))
    code = clean_text(data.get("otp"), 12)
    new_password = data.get("new_password") if isinstance(data.get("new_password"), str) else ""

    problem = _password_problem(new_password)
    if problem:
        return fail(problem)
    if not users.get_by_email(email):
        return fail("Incorrect verification code.")

    try:
        otp_service.verify("reset", email, code)
    except otp_service.OtpError as exc:
        return fail(exc.message, exc.status)

    users.update_password(email, generate_password_hash(new_password))
    auth_tokens.delete_for_user(email)
    login_logs.log(email, client_ip(), success=True, user_agent=user_agent(), note="password reset")
    return ok("Password updated successfully. Please log in.")
