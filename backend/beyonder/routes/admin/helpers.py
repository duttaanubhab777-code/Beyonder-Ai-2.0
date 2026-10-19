from __future__ import annotations

from flask import g, request

from beyonder.database import audit
from beyonder.services import auth_service
from beyonder.utils.request_info import client_ip
from beyonder.utils.validators import to_int


def record(action, target="", detail=""):
    """Write an entry to the admin audit log (who did what, from where)."""
    audit.log(g.user_email, action, target, detail, client_ip())


def page_args(default_per_page=30):
    page = to_int(request.args.get("page"), 1, minimum=1)
    per_page = to_int(request.args.get("per_page"), default_per_page, minimum=1, maximum=100)
    return page, per_page, (page - 1) * per_page


def user_dict(row):
    return {
        "name": row["name"],
        "email": row["email"],
        "created_at": row["created_at"],
        "last_login_at": row["last_login_at"],
        "address": row["address"],
        "is_banned": bool(row["is_banned"]),
        "ban_reason": row["ban_reason"],
        "admin_note": row["admin_note"],
        "has_avatar": bool(row["has_avatar"]) if "has_avatar" in row.keys() else bool(row["avatar"]),
        "chat_count": row["chat_count"] if "chat_count" in row.keys() else None,
        "is_admin": auth_service.is_admin(row["email"]),
    }
