from __future__ import annotations

from .connection import get_db


def insert(token_hash, email, now, expires_at, ip, ua, impersonated_by=None):
    db = get_db()
    db.execute(
        "INSERT INTO auth_tokens (token_hash, user_email, created_at, last_seen, expires_at, "
        "ip_address, user_agent, impersonated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (token_hash, email, now, now, expires_at, ip, ua, impersonated_by),
    )
    db.commit()


def get(token_hash):
    return get_db().execute(
        "SELECT * FROM auth_tokens WHERE token_hash = ?", (token_hash,)
    ).fetchone()


def touch(token_hash, now):
    db = get_db()
    db.execute("UPDATE auth_tokens SET last_seen = ? WHERE token_hash = ?", (now, token_hash))
    db.commit()


def delete(token_hash):
    db = get_db()
    db.execute("DELETE FROM auth_tokens WHERE token_hash = ?", (token_hash,))
    db.commit()


def delete_for_user(email, keep_hash=None):
    db = get_db()
    if keep_hash:
        n = db.execute(
            "DELETE FROM auth_tokens WHERE user_email = ? AND token_hash != ?", (email, keep_hash)
        ).rowcount
    else:
        n = db.execute("DELETE FROM auth_tokens WHERE user_email = ?", (email,)).rowcount
    db.commit()
    return n


def delete_by_prefix(prefix):
    db = get_db()
    n = db.execute("DELETE FROM auth_tokens WHERE token_hash LIKE ?", (prefix + "%",)).rowcount
    db.commit()
    return n


def list_for_user(email, now):
    return get_db().execute(
        "SELECT * FROM auth_tokens WHERE user_email = ? AND expires_at > ? ORDER BY last_seen DESC",
        (email, now),
    ).fetchall()


def prune_expired(now):
    db = get_db()
    db.execute("DELETE FROM auth_tokens WHERE expires_at < ?", (now,))
    db.commit()


def online(now, window):
    return get_db().execute(
        "SELECT user_email, MAX(last_seen) AS last_seen FROM auth_tokens "
        "WHERE last_seen >= ? AND expires_at > ? AND impersonated_by IS NULL "
        "GROUP BY user_email ORDER BY last_seen DESC",
        (now - window, now),
    ).fetchall()


def count_active(now):
    return get_db().execute(
        "SELECT COUNT(*) FROM auth_tokens WHERE expires_at > ?", (now,)
    ).fetchone()[0]
