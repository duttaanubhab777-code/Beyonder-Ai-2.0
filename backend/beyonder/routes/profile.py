from __future__ import annotations

from flask import Blueprint, g, request
from werkzeug.security import check_password_hash, generate_password_hash

from beyonder.database import auth_tokens, users
from beyonder.middleware.auth import login_required
from beyonder.services import auth_service
from beyonder.settings import get_settings
from beyonder.utils.responses import fail, ok

bp = Blueprint("profile", __name__, url_prefix="/api/profile")


@bp.get("")
@login_required
def get_profile():
    user = users.get_by_email(g.user_email)
    if not user:
        return fail("User not found.", 404)
    return ok(
        name=user["name"], email=user["email"], avatar=user["avatar"],
        address=user["address"], created_at=user["created_at"], is_admin=g.is_admin,
    )


@bp.post("/update")
@login_required
def update_profile():
    s = get_settings()
    data = request.get_json(silent=True) or {}
    name, avatar, address = data.get("name"), data.get("avatar"), data.get("address")

    if name is not None:
        name = str(name).strip()
        if not name:
            return fail("Name cannot be empty.")
        if len(name) > 80:
            return fail("Name is too long.")
    if avatar is not None:
        avatar = str(avatar)
        if not avatar.startswith("data:image/"):
            return fail("Invalid image.")
        if len(avatar) > s.MAX_AVATAR_BASE64_CHARS:
            return fail("That image is too large. Please choose a smaller photo.")
    if address is not None:
        address = str(address).strip()
        if len(address) > 300:
            return fail("Address is too long.")

    users.update_profile(g.user_email, name=name, avatar=avatar, address=address)
    return ok("Profile updated.")


@bp.post("/change-password")
@login_required
def change_password():
    s = get_settings()
    data = request.get_json(silent=True) or {}
    current = data.get("current_password") if isinstance(data.get("current_password"), str) else ""
    new = data.get("new_password") if isinstance(data.get("new_password"), str) else ""

    user = users.get_by_email(g.user_email)
    if not user or not check_password_hash(user["password_hash"], current):
        return fail("Current password is incorrect.", 401)
    if len(new) < s.MIN_PASSWORD_LENGTH:
        return fail(f"New password must be at least {s.MIN_PASSWORD_LENGTH} characters.")
    if len(new) > s.MAX_PASSWORD_LENGTH:
        return fail("Password is too long.")

    users.update_password(g.user_email, generate_password_hash(new))
    auth_tokens.delete_for_user(g.user_email, keep_hash=g.token_hash)
    return ok("Password changed successfully.")


@bp.post("/delete-account")
@login_required
def delete_account():
    data = request.get_json(silent=True) or {}
    password = data.get("password") if isinstance(data.get("password"), str) else ""
    if g.impersonated_by:
        return fail("Not allowed while viewing as a user.", 403)
    if auth_service.is_admin(g.user_email):
        return fail("Admin accounts are managed from config.py and can't be deleted here.", 403)
    user = users.get_by_email(g.user_email)
    if not user or not check_password_hash(user["password_hash"], password):
        return fail("Password is incorrect.", 401)
    users.delete_user(g.user_email)
    return ok("Your account and all its data were deleted.")
