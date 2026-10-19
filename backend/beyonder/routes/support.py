"""User side of the private 'Chat with Admin' line."""
from __future__ import annotations

from flask import Blueprint, g, request

from beyonder.database import support
from beyonder.middleware.auth import login_required
from beyonder.utils.responses import fail, ok
from beyonder.utils.validators import to_int

bp = Blueprint("support", __name__, url_prefix="/api/support")


@bp.post("/send")
@login_required
def send():
    data = request.get_json(silent=True) or {}
    message = str(data.get("message") or "").strip()
    if not message:
        return fail("Message cannot be empty.")
    if len(message) > 4000:
        return fail("Message is too long.")
    return ok(id=support.save_message(g.user_email, "user", message))


@bp.get("/messages")
@login_required
def messages():
    since_id = to_int(request.args.get("since_id"), 0, minimum=0)
    rows = support.messages(g.user_email, since_id)
    return ok(messages=[
        {"id": r["id"], "sender": r["sender"], "message": r["message"], "timestamp": r["timestamp"]}
        for r in rows
    ])
