from __future__ import annotations

import time

from .connection import get_db


def log(email, ip, success=True, user_agent="", note=""):
    db = get_db()
    db.execute(
        "INSERT INTO login_logs (user_email, ip_address, timestamp, success, user_agent, note) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (email, ip, time.time(), 1 if success else 0, user_agent, note),
    )
    db.commit()


def _filters(email, success):
    where, params = [], []
    if email:
        where.append("user_email LIKE ? ESCAPE '\\'")
        params.append("%" + email.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%")
    if success is not None:
        where.append("success = ?")
        params.append(1 if success else 0)
    return ("WHERE " + " AND ".join(where)) if where else "", params


def recent(email="", success=None, limit=100, offset=0):
    clause, params = _filters(email, success)
    return get_db().execute(
        f"SELECT * FROM login_logs {clause} ORDER BY id DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()


def count(email="", success=None):
    clause, params = _filters(email, success)
    return get_db().execute(f"SELECT COUNT(*) FROM login_logs {clause}", params).fetchone()[0]


def recent_for_user(email, limit=10):
    return get_db().execute(
        "SELECT * FROM login_logs WHERE user_email = ? ORDER BY id DESC LIMIT ?", (email, limit)
    ).fetchall()
