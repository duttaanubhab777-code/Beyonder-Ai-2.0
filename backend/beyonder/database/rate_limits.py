from __future__ import annotations

from .connection import get_db


def hit(bucket, now):
    db = get_db()
    db.execute("INSERT INTO rate_limits (bucket, ts) VALUES (?, ?)", (bucket, now))
    db.commit()


def count(bucket, since):
    return get_db().execute(
        "SELECT COUNT(*) FROM rate_limits WHERE bucket = ? AND ts >= ?", (bucket, since)
    ).fetchone()[0]


def clear(bucket):
    db = get_db()
    db.execute("DELETE FROM rate_limits WHERE bucket = ?", (bucket,))
    db.commit()


def prune(before):
    db = get_db()
    db.execute("DELETE FROM rate_limits WHERE ts < ?", (before,))
    db.commit()
