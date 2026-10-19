from __future__ import annotations

from flask import request

from beyonder.database import chats
from beyonder.middleware.auth import admin_required
from beyonder.utils.responses import fail, ok
from beyonder.utils.validators import clean_email, clean_session_id, clean_text

from . import admin_bp
from .helpers import page_args, record


def _chat_dict(r):
    return {
        "id": r["id"], "email": r["user_email"], "user_message": r["user_message"],
        "ai_response": r["ai_response"], "timestamp": r["timestamp"],
        "source": r["source"], "session_id": r["session_id"],
    }


@admin_bp.get("/chats")
@admin_required
def list_chats():
    """Search every AI conversation. Filters: q (text), email, session_id."""
    page, per_page, offset = page_args(30)
    q = clean_text(request.args.get("q", ""), 100)
    email = clean_email(request.args.get("email", ""))
    session_id = request.args.get("session_id", "")
    newest_first = request.args.get("order", "desc") != "asc"
    rows = chats.search(q, email, session_id, per_page, offset, newest_first)
    return ok(
        chats=[_chat_dict(r) for r in rows],
        total=chats.count(q, email, session_id), page=page, per_page=per_page,
    )


@admin_bp.get("/users/<email>/sessions")
@admin_required
def user_sessions(email):
    rows = chats.sessions(clean_email(email))
    return ok(sessions=[
        {"session_id": r["session_id"], "title": (r["title"] or "(no user message)")[:80],
         "last_updated": r["last_updated"], "message_count": r["message_count"]}
        for r in rows
    ])


@admin_bp.delete("/chats/<int:chat_id>")
@admin_required
def delete_chat(chat_id):
    n = chats.delete_by_id(chat_id)
    if not n:
        return fail("Message not found.", 404)
    record("chat.delete", str(chat_id))
    return ok("Message deleted.")


@admin_bp.delete("/users/<email>/sessions/<session_id>")
@admin_required
def delete_user_session(email, session_id):
    email = clean_email(email)
    n = chats.delete_session(email, clean_session_id(session_id))
    record("chat.delete_session", email, session_id)
    return ok(f"Deleted {n} message(s).", deleted=n)


@admin_bp.delete("/users/<email>/chats")
@admin_required
def delete_user_chats(email):
    email = clean_email(email)
    n = chats.delete_for_user(email)
    record("chat.delete_all", email, f"{n} messages")
    return ok(f"Deleted {n} message(s).", deleted=n)
