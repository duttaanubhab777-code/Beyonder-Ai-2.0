"""AI chat storage: save, history, sessions, and the admin->user inbox."""
from __future__ import annotations

from flask import Blueprint, g, request

from beyonder.database import chats, notifications
from beyonder.middleware.auth import login_required
from beyonder.settings import get_settings
from beyonder.utils.responses import fail, ok
from beyonder.utils.validators import clean_session_id

bp = Blueprint("chat", __name__, url_prefix="/api")

MAX_USER_MESSAGE = 8000
MAX_AI_RESPONSE = 40000


@bp.post("/save-chat")
@login_required
def save_chat():
    data = request.get_json(silent=True) or {}
    user_message = str(data.get("user_message") or "")[:MAX_USER_MESSAGE]
    ai_response = str(data.get("ai_response") or "")[:MAX_AI_RESPONSE]
    if not user_message and not ai_response:
        return fail("Nothing to save.")
    session_id = clean_session_id(data.get("session_id"))
    chats.save_chat(g.user_email, user_message, ai_response, source="ai", session_id=session_id)
    return ok()


@bp.get("/chat-history")
@login_required
def chat_history():
    session_id = clean_session_id(request.args.get("session_id"))
    rows = chats.for_session(g.user_email, session_id, limit=get_settings().CHAT_HISTORY_LIMIT)
    history = []
    for r in rows:
        if r["source"] == "admin":
            history.append({"role": "model", "source": "admin", "parts": [{"text": r["ai_response"]}]})
            continue
        if r["user_message"]:
            history.append({"role": "user", "parts": [{"text": r["user_message"]}]})
        if r["ai_response"]:
            history.append({"role": "model", "parts": [{"text": r["ai_response"]}]})
    return ok(history=history)


@bp.get("/chat-sessions")
@login_required
def chat_sessions():
    items = [
        {
            "session_id": r["session_id"],
            "title": (r["title"] or "New conversation").strip()[:80],
            "last_updated": r["last_updated"],
            "message_count": r["message_count"],
        }
        for r in chats.sessions(g.user_email)
    ]
    return ok(sessions=items)


@bp.delete("/chat-sessions/<session_id>")
@login_required
def delete_session(session_id):
    n = chats.delete_session(g.user_email, clean_session_id(session_id))
    return ok("Chat deleted.", deleted=n)


@bp.get("/inbox")
@login_required
def inbox():
    session_id = clean_session_id(request.args.get("session_id"))
    rows = notifications.claim(g.user_email, session_id)
    return ok(messages=[{"id": r["id"], "text": r["body"], "timestamp": r["created_at"]} for r in rows])
