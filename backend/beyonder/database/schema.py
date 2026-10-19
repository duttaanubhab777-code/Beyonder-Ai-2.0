"""
Database schema + safe migrations.

init_db() can run on every start: it only creates what is missing and adds
new columns to an OLD database (so your existing users and chats survive).
"""
from __future__ import annotations

import os
import sqlite3

TABLES = [
    """
    CREATE TABLE IF NOT EXISTS users (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT NOT NULL,
        email           TEXT NOT NULL UNIQUE,
        password_hash   TEXT NOT NULL,
        created_at      REAL NOT NULL,
        last_login_at   REAL,
        avatar          TEXT,
        address         TEXT,
        is_banned       INTEGER NOT NULL DEFAULT 0,
        ban_reason      TEXT,
        banned_at       REAL,
        admin_note      TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS chat_history (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email      TEXT NOT NULL,
        user_message    TEXT NOT NULL,
        ai_response     TEXT NOT NULL,
        timestamp       REAL NOT NULL,
        source          TEXT NOT NULL DEFAULT 'ai',
        session_id      TEXT NOT NULL DEFAULT 'default_session'
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS login_logs (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email      TEXT NOT NULL,
        ip_address      TEXT,
        timestamp       REAL NOT NULL,
        success         INTEGER NOT NULL DEFAULT 1,
        user_agent      TEXT,
        note            TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS push_subscriptions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email      TEXT NOT NULL,
        endpoint        TEXT NOT NULL UNIQUE,
        p256dh          TEXT NOT NULL,
        auth            TEXT NOT NULL,
        created_at      REAL NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS admin_chat (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email      TEXT NOT NULL,
        sender          TEXT NOT NULL,
        message         TEXT NOT NULL,
        timestamp       REAL NOT NULL,
        read_by_admin   INTEGER NOT NULL DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS auth_tokens (
        token_hash      TEXT PRIMARY KEY,
        user_email      TEXT NOT NULL,
        created_at      REAL NOT NULL,
        last_seen       REAL NOT NULL,
        expires_at      REAL NOT NULL,
        ip_address      TEXT,
        user_agent      TEXT,
        impersonated_by TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS otp_codes (
        key             TEXT PRIMARY KEY,
        purpose         TEXT NOT NULL,
        email           TEXT NOT NULL,
        otp_hash        TEXT NOT NULL,
        payload         TEXT,
        expires_at      REAL NOT NULL,
        attempts        INTEGER NOT NULL DEFAULT 0,
        last_sent       REAL NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS rate_limits (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        bucket          TEXT NOT NULL,
        ts              REAL NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS notifications (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email      TEXT NOT NULL,
        body            TEXT NOT NULL,
        created_at      REAL NOT NULL,
        delivered_at    REAL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS app_settings (
        key             TEXT PRIMARY KEY,
        value           TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS audit_log (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_email     TEXT NOT NULL,
        action          TEXT NOT NULL,
        target          TEXT,
        detail          TEXT,
        ip_address      TEXT,
        timestamp       REAL NOT NULL
    )
    """,
]

COLUMN_MIGRATIONS = [
    ("users", "avatar", "TEXT"),
    ("users", "address", "TEXT"),
    ("users", "is_banned", "INTEGER NOT NULL DEFAULT 0"),
    ("users", "ban_reason", "TEXT"),
    ("users", "banned_at", "REAL"),
    ("users", "admin_note", "TEXT"),
    ("chat_history", "source", "TEXT NOT NULL DEFAULT 'ai'"),
    ("chat_history", "session_id", "TEXT NOT NULL DEFAULT 'default_session'"),
    ("login_logs", "user_agent", "TEXT"),
    ("login_logs", "note", "TEXT"),
]

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_chat_user_email ON chat_history(user_email)",
    "CREATE INDEX IF NOT EXISTS idx_chat_source ON chat_history(user_email, source, id)",
    "CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_history(user_email, session_id)",
    "CREATE INDEX IF NOT EXISTS idx_chat_time ON chat_history(timestamp)",
    "CREATE INDEX IF NOT EXISTS idx_login_logs_email ON login_logs(user_email)",
    "CREATE INDEX IF NOT EXISTS idx_login_logs_time ON login_logs(timestamp)",
    "CREATE INDEX IF NOT EXISTS idx_admin_chat_email ON admin_chat(user_email, id)",
    "CREATE INDEX IF NOT EXISTS idx_push_subs_email ON push_subscriptions(user_email)",
    "CREATE INDEX IF NOT EXISTS idx_tokens_email ON auth_tokens(user_email)",
    "CREATE INDEX IF NOT EXISTS idx_tokens_seen ON auth_tokens(last_seen)",
    "CREATE INDEX IF NOT EXISTS idx_rate_bucket ON rate_limits(bucket, ts)",
    "CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_email, delivered_at)",
    "CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(timestamp)",
    "CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at)",
]


def _has_column(cur, table, column):
    cur.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cur.fetchall())


def init_db(path):
    folder = os.path.dirname(os.path.abspath(path))
    os.makedirs(folder, exist_ok=True)

    conn = sqlite3.connect(path, timeout=15)
    try:
        cur = conn.cursor()
        for ddl in TABLES:
            cur.execute(ddl)
        for table, column, ddl in COLUMN_MIGRATIONS:
            if not _has_column(cur, table, column):
                cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
        for ddl in INDEXES:
            cur.execute(ddl)
        conn.commit()
    finally:
        conn.close()
