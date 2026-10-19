from __future__ import annotations

from .connection import get_db


def get(key):
    return get_db().execute("SELECT * FROM otp_codes WHERE key = ?", (key,)).fetchone()


def upsert(key, purpose, email, otp_hash, payload, expires_at, now):
    db = get_db()
    db.execute(
        "INSERT INTO otp_codes (key, purpose, email, otp_hash, payload, expires_at, attempts, last_sent) "
        "VALUES (?, ?, ?, ?, ?, ?, 0, ?) "
        "ON CONFLICT(key) DO UPDATE SET otp_hash = excluded.otp_hash, payload = excluded.payload, "
        "expires_at = excluded.expires_at, attempts = 0, last_sent = excluded.last_sent",
        (key, purpose, email, otp_hash, payload, expires_at, now),
    )
    db.commit()


def bump_attempts(key):
    db = get_db()
    db.execute("UPDATE otp_codes SET attempts = attempts + 1 WHERE key = ?", (key,))
    db.commit()
    row = db.execute("SELECT attempts FROM otp_codes WHERE key = ?", (key,)).fetchone()
    return row["attempts"] if row else 0


def delete(key):
    db = get_db()
    db.execute("DELETE FROM otp_codes WHERE key = ?", (key,))
    db.commit()


def prune(now):
    db = get_db()
    db.execute("DELETE FROM otp_codes WHERE expires_at < ?", (now - 3600,))
    db.commit()
