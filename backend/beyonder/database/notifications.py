from __future__ import annotations

import time

from .connection import get_db


def add(user_email, body):
    db = get_db()
    cur = db.execute(
        "INSERT INTO notifications (user_email, body, created_at) VALUES (?, ?, ?)",
        (user_email, body, time.time()),
    )
    db.commit()
    return cur.lastrowid


def add_many(emails, body):
    db = get_db()
    now = time.time()
    db.executemany(
        "INSERT INTO notifications (user_email, body, created_at) VALUES (?, ?, ?)",
        [(e, body, now) for e in emails],
    )
    db.commit()
    return len(emails)


def claim(user_email, session_id):
    db = get_db()
    rows = db.execute(
        "SELECT id, body, created_at FROM notifications "
        "WHERE user_email = ? AND delivered_at IS NULL ORDER BY id ASC",
        (user_email,),
    ).fetchall()
    if not rows:
        return []
    now = time.time()
    for r in rows:
        db.execute(
            "INSERT INTO chat_history (user_email, user_message, ai_response, timestamp, source, session_id) "
            "VALUES (?, '', ?, ?, 'admin', ?)",
            (user_email, r["body"], now, session_id),
        )
        db.execute("UPDATE notifications SET delivered_at = ? WHERE id = ?", (now, r["id"]))
    db.commit()
    return rows
