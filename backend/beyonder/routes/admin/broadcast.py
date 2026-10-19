from __future__ import annotations

import time

from flask import request

from beyonder.database import auth_tokens, notifications, users
from beyonder.middleware.auth import admin_required
from beyonder.services import push_service
from beyonder.settings import get_settings
from beyonder.utils.responses import fail, ok
from beyonder.utils.validators import clean_text

from . import admin_bp
from .helpers import record


@admin_bp.post("/broadcast")
@admin_required
def broadcast():
    """Send one message to everybody (or only people online right now)."""
    data = request.get_json(silent=True) or {}
    message = clean_text(data.get("message"), 4000)
    audience = data.get("audience", "all")
    if not message:
        return fail("Message cannot be empty.")

    if audience == "online":
        rows = auth_tokens.online(time.time(), get_settings().PRESENCE_ONLINE_WINDOW_SECONDS)
        emails = [r["user_email"] for r in rows]
    else:
        audience = "all"
        emails = users.all_emails()
    if not emails:
        return fail("There is nobody to send this to.")

    notifications.add_many(emails, message)
    pushed = 0
    if data.get("push", True):
        pushed = push_service.send_to_emails(emails, "Beyonder AI", message)
    record("broadcast", audience, f"{len(emails)} users: {message[:100]}")
    return ok(f"Sent to {len(emails)} user(s).", recipients=len(emails), pushed=pushed)
