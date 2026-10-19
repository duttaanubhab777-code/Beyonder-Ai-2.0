from __future__ import annotations

import time

from .connection import get_db


def save(user_email, endpoint, p256dh, auth):
    db = get_db()
    db.execute(
        "INSERT INTO push_subscriptions (user_email, endpoint, p256dh, auth, created_at) "
        "VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(endpoint) DO UPDATE SET user_email = excluded.user_email, "
        "p256dh = excluded.p256dh, auth = excluded.auth",
        (user_email, endpoint, p256dh, auth, time.time()),
    )
    db.commit()


def for_user(user_email):
    return get_db().execute(
        "SELECT * FROM push_subscriptions WHERE user_email = ?", (user_email,)
    ).fetchall()


def all_subscriptions():
    return get_db().execute("SELECT * FROM push_subscriptions").fetchall()


def delete(endpoint):
    db = get_db()
    db.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
    db.commit()


def count():
    return get_db().execute("SELECT COUNT(*) FROM push_subscriptions").fetchone()[0]
