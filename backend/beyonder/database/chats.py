from __future__ import annotations

import time

from .connection import get_db


def _like(q):
    q = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{q}%"


def save_chat(user_email, user_message, ai_response, source="ai", session_id="default_session"):
    db = get_db()
    cur = db.execute(
        "INSERT INTO chat_history (user_email, user_message, ai_response, timestamp, source, session_id) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (user_email, user_message, ai_response, time.time(), source, session_id),
    )
    db.commit()
    return cur.lastrowid


def for_session(email, session_id, limit=300):
    rows = get_db().execute(
        "SELECT * FROM (SELECT * FROM chat_history WHERE user_email = ? AND session_id = ? "
        "ORDER BY id DESC LIMIT ?) ORDER BY id ASC",
        (email, session_id, limit),
    ).fetchall()
    return rows


def sessions(email):
    return get_db().execute(
        """
        SELECT c1.session_id AS session_id,
               MIN(c1.timestamp) AS created_at,
               MAX(c1.timestamp) AS last_updated,
               COUNT(*) AS message_count,
               (SELECT c2.user_message FROM chat_history c2
                 WHERE c2.user_email = c1.user_email AND c2.session_id = c1.session_id
                   AND c2.user_message != ''
                 ORDER BY c2.id ASC LIMIT 1) AS title
        FROM chat_history c1
        WHERE c1.user_email = ?
        GROUP BY c1.session_id
        ORDER BY last_updated DESC
        """,
        (email,),
    ).fetchall()


def delete_session(email, session_id):
    db = get_db()
    n = db.execute(
        "DELETE FROM chat_history WHERE user_email = ? AND session_id = ?", (email, session_id)
    ).rowcount
    db.commit()
    return n


def delete_by_id(chat_id):
    db = get_db()
    n = db.execute("DELETE FROM chat_history WHERE id = ?", (chat_id,)).rowcount
    db.commit()
    return n


def delete_for_user(email):
    db = get_db()
    n = db.execute("DELETE FROM chat_history WHERE user_email = ?", (email,)).rowcount
    db.commit()
    return n


def _filters(q, email, session_id):
    where, params = [], []
    if email:
        where.append("user_email = ?")
        params.append(email)
    if session_id:
        where.append("session_id = ?")
        params.append(session_id)
    if q:
        where.append("(user_message LIKE ? ESCAPE '\\' OR ai_response LIKE ? ESCAPE '\\')")
        params += [_like(q), _like(q)]
    return ("WHERE " + " AND ".join(where)) if where else "", params


def search(q="", email="", session_id="", limit=50, offset=0, newest_first=True):
    clause, params = _filters(q, email, session_id)
    order = "DESC" if newest_first else "ASC"
    return get_db().execute(
        f"SELECT * FROM chat_history {clause} ORDER BY id {order} LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()


def count(q="", email="", session_id=""):
    clause, params = _filters(q, email, session_id)
    return get_db().execute(f"SELECT COUNT(*) FROM chat_history {clause}", params).fetchone()[0]
