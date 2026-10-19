from __future__ import annotations

import time

from .connection import get_db

_LIST_COLUMNS = """
    u.id, u.name, u.email, u.created_at, u.last_login_at, u.address,
    u.is_banned, u.ban_reason, u.banned_at, u.admin_note,
    CASE WHEN u.avatar IS NOT NULL AND u.avatar != '' THEN 1 ELSE 0 END AS has_avatar,
    (SELECT COUNT(*) FROM chat_history c WHERE c.user_email = u.email AND c.source = 'ai') AS chat_count
"""


def _like(q):
    q = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{q}%"


def create_user(name, email, password_hash):
    db = get_db()
    cur = db.execute(
        "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
        (name, email, password_hash, time.time()),
    )
    db.commit()
    return cur.lastrowid


def get_by_email(email):
    return get_db().execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()


def update_last_login(email):
    db = get_db()
    db.execute("UPDATE users SET last_login_at = ? WHERE email = ?", (time.time(), email))
    db.commit()


def update_password(email, password_hash):
    db = get_db()
    db.execute("UPDATE users SET password_hash = ? WHERE email = ?", (password_hash, email))
    db.commit()


def update_profile(email, name=None, avatar=None, address=None):
    db = get_db()
    if name is not None:
        db.execute("UPDATE users SET name = ? WHERE email = ?", (name, email))
    if avatar is not None:
        db.execute("UPDATE users SET avatar = ? WHERE email = ?", (avatar, email))
    if address is not None:
        db.execute("UPDATE users SET address = ? WHERE email = ?", (address, email))
    db.commit()


def set_banned(email, banned, reason=""):
    db = get_db()
    db.execute(
        "UPDATE users SET is_banned = ?, ban_reason = ?, banned_at = ? WHERE email = ?",
        (1 if banned else 0, reason if banned else None, time.time() if banned else None, email),
    )
    db.commit()


def set_admin_note(email, note):
    db = get_db()
    db.execute("UPDATE users SET admin_note = ? WHERE email = ?", (note, email))
    db.commit()


def _filters(q, banned):
    where, params = [], []
    if q:
        where.append("(u.email LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\')")
        params += [_like(q), _like(q)]
    if banned is not None:
        where.append("u.is_banned = ?")
        params.append(1 if banned else 0)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    return clause, params


def search_users(q="", banned=None, limit=50, offset=0):
    clause, params = _filters(q, banned)
    return get_db().execute(
        f"SELECT {_LIST_COLUMNS} FROM users u {clause} ORDER BY u.created_at DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()


def count_users(q="", banned=None):
    clause, params = _filters(q, banned)
    return get_db().execute(f"SELECT COUNT(*) FROM users u {clause}", params).fetchone()[0]


def all_emails():
    return [r["email"] for r in get_db().execute("SELECT email FROM users").fetchall()]


def names_by_email():
    return {r["email"]: r["name"] for r in get_db().execute("SELECT email, name FROM users").fetchall()}


def delete_user(email):
    db = get_db()
    for table in ("chat_history", "admin_chat", "login_logs", "push_subscriptions",
                  "auth_tokens", "notifications"):
        col = "user_email"
        db.execute(f"DELETE FROM {table} WHERE {col} = ?", (email,))
    db.execute("DELETE FROM users WHERE email = ?", (email,))
    db.commit()
