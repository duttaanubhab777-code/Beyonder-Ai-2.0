"""Direct user <-> admin chat (the 'Chat with Admin' feature)."""
from __future__ import annotations

import time

from .connection import get_db


def save_message(user_email, sender, message):
    db = get_db()
    cur = db.execute(
        "INSERT INTO admin_chat (user_email, sender, message, timestamp, read_by_admin) "
        "VALUES (?, ?, ?, ?, ?)",
        (user_email, sender, message, time.time(), 1 if sender == "admin" else 0),
    )
    db.commit()
    return cur.lastrowid


def messages(user_email, since_id=0):
    return get_db().execute(
        "SELECT * FROM admin_chat WHERE user_email = ? AND id > ? ORDER BY id ASC",
        (user_email, since_id),
    ).fetchall()


def mark_read(user_email):
    db = get_db()
    db.execute(
        "UPDATE admin_chat SET read_by_admin = 1 WHERE user_email = ? AND sender = 'user'",
        (user_email,),
    )
    db.commit()


def delete_thread(user_email):
    db = get_db()
    n = db.execute("DELETE FROM admin_chat WHERE user_email = ?", (user_email,)).rowcount
    db.commit()
    return n


def threads():
    return get_db().execute(
        """
        SELECT a1.user_email AS user_email,
               MAX(a1.id) AS last_id,
               (SELECT message   FROM admin_chat a2 WHERE a2.user_email = a1.user_email ORDER BY a2.id DESC LIMIT 1) AS last_message,
               (SELECT sender    FROM admin_chat a3 WHERE a3.user_email = a1.user_email ORDER BY a3.id DESC LIMIT 1) AS last_sender,
               (SELECT timestamp FROM admin_chat a4 WHERE a4.user_email = a1.user_email ORDER BY a4.id DESC LIMIT 1) AS last_timestamp,
               SUM(CASE WHEN a1.sender = 'user' AND a1.read_by_admin = 0 THEN 1 ELSE 0 END) AS unread_count
        FROM admin_chat a1
        GROUP BY a1.user_email
        ORDER BY last_timestamp DESC
        """
    ).fetchall()


def unread_total():
    row = get_db().execute(
        "SELECT COUNT(*) FROM admin_chat WHERE sender = 'user' AND read_by_admin = 0"
    ).fetchone()
    return row[0]
