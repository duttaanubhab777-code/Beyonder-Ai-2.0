from __future__ import annotations

import time

from .connection import get_db


def log(admin_email, action, target="", detail="", ip=""):
    db = get_db()
    db.execute(
        "INSERT INTO audit_log (admin_email, action, target, detail, ip_address, timestamp) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (admin_email, action, target, (detail or "")[:500], ip, time.time()),
    )
    db.commit()


def recent(limit=100, offset=0):
    return get_db().execute(
        "SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?", (limit, offset)
    ).fetchall()


def count():
    return get_db().execute("SELECT COUNT(*) FROM audit_log").fetchone()[0]
