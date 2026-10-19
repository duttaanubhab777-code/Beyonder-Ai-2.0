from __future__ import annotations

from flask import request

from beyonder.database import audit, auth_tokens, login_logs
from beyonder.middleware.auth import admin_required
from beyonder.utils.responses import fail, ok
from beyonder.utils.validators import clean_text

from . import admin_bp
from .helpers import page_args, record


@admin_bp.get("/logs")
@admin_required
def login_history():
    page, per_page, offset = page_args(50)
    email = clean_text(request.args.get("email", ""), 100)
    status = request.args.get("status", "")
    success = True if status == "success" else False if status == "failed" else None
    rows = login_logs.recent(email, success, per_page, offset)
    return ok(
        logs=[{"id": r["id"], "email": r["user_email"], "ip": r["ip_address"],
               "timestamp": r["timestamp"], "success": bool(r["success"]),
               "user_agent": r["user_agent"], "note": r["note"]} for r in rows],
        total=login_logs.count(email, success), page=page, per_page=per_page,
    )


@admin_bp.get("/audit")
@admin_required
def audit_trail():
    page, per_page, offset = page_args(50)
    rows = audit.recent(per_page, offset)
    return ok(
        entries=[{"id": r["id"], "admin": r["admin_email"], "action": r["action"],
                  "target": r["target"], "detail": r["detail"], "ip": r["ip_address"],
                  "timestamp": r["timestamp"]} for r in rows],
        total=audit.count(), page=page, per_page=per_page,
    )


@admin_bp.delete("/sessions/<session_id>")
@admin_required
def revoke_session(session_id):
    if len(session_id) < 8:
        return fail("Invalid session id.")
    n = auth_tokens.delete_by_prefix(session_id)
    record("session.revoke", session_id)
    return ok("Session revoked.", count=n)
