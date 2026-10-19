from __future__ import annotations

from flask import request

from beyonder.database import notifications, support, users  # noqa: F401
from beyonder.middleware.auth import admin_required
from beyonder.services import push_service
from beyonder.utils.responses import fail, ok
from beyonder.utils.validators import clean_email, clean_text, to_int

from . import admin_bp
from .helpers import record


@admin_bp.get("/support/threads")
@admin_required
def threads():
    names = users.names_by_email()
    items = [
        {"email": t["user_email"], "name": names.get(t["user_email"], t["user_email"]),
         "last_message": t["last_message"], "last_sender": t["last_sender"],
         "last_timestamp": t["last_timestamp"], "unread_count": t["unread_count"] or 0}
        for t in support.threads()
    ]
    return ok(threads=items, unread_total=sum(i["unread_count"] for i in items))


@admin_bp.get("/support/thread/<email>")
@admin_required
def thread(email):
    email = clean_email(email)
    since_id = to_int(request.args.get("since_id"), 0, minimum=0)
    rows = support.messages(email, since_id)
    support.mark_read(email)
    return ok(email=email, messages=[
        {"id": r["id"], "sender": r["sender"], "message": r["message"], "timestamp": r["timestamp"]}
        for r in rows
    ])


@admin_bp.post("/support/reply")
@admin_required
def reply():
    data = request.get_json(silent=True) or {}
    email = clean_email(data.get("email"))
    message = clean_text(data.get("message"), 4000)
    if not email or not message:
        return fail("Both email and message are required.")
    if not users.get_by_email(email):
        return fail("No such user.", 404)
    new_id = support.save_message(email, "admin", message)
    push_service.send_to_user(email, "New message from Beyonder AI Support", message)
    record("support.reply", email, message[:120])
    return ok(id=new_id)


@admin_bp.delete("/support/thread/<email>")
@admin_required
def delete_thread(email):
    email = clean_email(email)
    n = support.delete_thread(email)
    record("support.delete_thread", email, f"{n} messages")
    return ok(f"Deleted {n} message(s).", deleted=n)
