# -----------------------------------------------------------------
# SQLite handling for Beyonder AI — users, chat history, login logs,
# and admin-injected messages. Everything lives in a single file
# (beyonder.db), so no extra database service is required on
# PythonAnywhere's free tier.
#
# v2/v3 changes:
#   - chat_history now has a `source` column ("ai" | "admin").
#   - Added `session_id` column to group messages into distinct chats.
#   - init_db() is migration-safe.
# -----------------------------------------------------------------

import sqlite3
import time
from flask import g

DB_PATH = "beyonder.db"


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH, timeout=10, check_same_thread=False)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(e=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def _column_exists(cur, table, column):
    cur.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cur.fetchall())


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            email           TEXT NOT NULL UNIQUE,
            password_hash   TEXT NOT NULL,
            created_at      REAL NOT NULL,
            last_login_at   REAL,
            avatar          TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email      TEXT NOT NULL,
            user_message    TEXT NOT NULL,
            ai_response     TEXT NOT NULL,
            timestamp       REAL NOT NULL,
            source          TEXT NOT NULL DEFAULT 'ai'
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS login_logs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email      TEXT NOT NULL,
            ip_address      TEXT,
            timestamp       REAL NOT NULL,
            success         INTEGER NOT NULL DEFAULT 1
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email      TEXT NOT NULL,
            endpoint        TEXT NOT NULL UNIQUE,
            p256dh          TEXT NOT NULL,
            auth            TEXT NOT NULL,
            created_at      REAL NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS admin_chat (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email      TEXT NOT NULL,
            sender          TEXT NOT NULL,
            message         TEXT NOT NULL,
            timestamp       REAL NOT NULL,
            read_by_admin   INTEGER NOT NULL DEFAULT 0
        )
    """)

    if not _column_exists(cur, "chat_history", "source"):
        cur.execute("ALTER TABLE chat_history ADD COLUMN source TEXT NOT NULL DEFAULT 'ai'")

    if not _column_exists(cur, "users", "avatar"):
        cur.execute("ALTER TABLE users ADD COLUMN avatar TEXT")

    if not _column_exists(cur, "users", "address"):
        cur.execute("ALTER TABLE users ADD COLUMN address TEXT")

    # ---- NEW: Migration for `session_id` column ----
    if not _column_exists(cur, "chat_history", "session_id"):
        cur.execute("ALTER TABLE chat_history ADD COLUMN session_id TEXT NOT NULL DEFAULT 'default_session'")


    # ---- Indexes ----
    cur.execute("CREATE INDEX IF NOT EXISTS idx_chat_user_email ON chat_history(user_email)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_chat_source ON chat_history(user_email, source, id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_login_logs_email ON login_logs(user_email)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_admin_chat_email ON admin_chat(user_email, id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_push_subs_email ON push_subscriptions(user_email)")
    
    # ---- NEW: Index for chat sessions ----
    cur.execute("CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_history(user_email, session_id)")

    conn.commit()
    conn.close()


# ---------------------- USER HELPERS ----------------------
def create_user(name, email, password_hash):
    db = get_db()
    now = time.time()
    db.execute(
        "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
        (name, email, password_hash, now),
    )
    db.commit()

def get_user_by_email(email):
    db = get_db()
    return db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

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

def get_all_users():
    db = get_db()
    return db.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()

def delete_user(email):
    db = get_db()
    db.execute("DELETE FROM users WHERE email = ?", (email,))
    db.execute("DELETE FROM chat_history WHERE user_email = ?", (email,))
    db.execute("DELETE FROM login_logs WHERE user_email = ?", (email,))
    db.execute("DELETE FROM push_subscriptions WHERE user_email = ?", (email,))
    db.commit()


# ---------------------- CHAT HELPERS (UPDATED) ----------------------
def save_chat(user_email, user_message, ai_response, source="ai", session_id="default_session"):
    db = get_db()
    cur = db.execute(
        "INSERT INTO chat_history (user_email, user_message, ai_response, timestamp, source, session_id) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (user_email, user_message, ai_response, time.time(), source, session_id),
    )
    db.commit()
    return cur.lastrowid

def save_admin_message(user_email, message):
    return save_chat(user_email, "", message, source="admin")

def get_all_chats(limit=500):
    db = get_db()
    return db.execute(
        "SELECT * FROM chat_history ORDER BY timestamp DESC LIMIT ?", (limit,)
    ).fetchall()

def get_chats_for_user(email, limit=500):
    db = get_db()
    return db.execute(
        "SELECT * FROM chat_history WHERE user_email = ? ORDER BY timestamp ASC LIMIT ?",
        (email, limit),
    ).fetchall()

def get_chats_for_session(email, session_id, limit=500):
    db = get_db()
    return db.execute(
        "SELECT * FROM chat_history WHERE user_email = ? AND session_id = ? ORDER BY timestamp ASC LIMIT ?",
        (email, session_id, limit),
    ).fetchall()

def get_chat_sessions(email):
    db = get_db()
    return db.execute("""
        SELECT session_id,
               MIN(timestamp) as created_at,
               MAX(timestamp) as last_updated,
               (SELECT user_message FROM chat_history c2 
                WHERE c2.session_id = c1.session_id AND c2.user_message != '' 
                ORDER BY id ASC LIMIT 1) as title
        FROM chat_history c1
        WHERE user_email = ?
        GROUP BY session_id
        ORDER BY last_updated DESC
    """, (email,)).fetchall()

def get_new_admin_messages(user_email, since_id=0):
    db = get_db()
    return db.execute(
        "SELECT id, ai_response, timestamp FROM chat_history "
        "WHERE user_email = ? AND source = 'admin' AND id > ? "
        "ORDER BY id ASC",
        (user_email, since_id),
    ).fetchall()


# ---------------------- LOGIN LOG HELPERS ----------------------
def log_login_attempt(email, ip_address, success=True):
    db = get_db()
    db.execute(
        "INSERT INTO login_logs (user_email, ip_address, timestamp, success) VALUES (?, ?, ?, ?)",
        (email, ip_address, time.time(), 1 if success else 0),
    )
    db.commit()

def get_all_login_logs(limit=500):
    db = get_db()
    return db.execute(
        "SELECT * FROM login_logs ORDER BY timestamp DESC LIMIT ?", (limit,)
    ).fetchall()


# ---------------------- DIRECT ADMIN-CHAT HELPERS ----------------------
def save_admin_chat_message(user_email, sender, message):
    db = get_db()
    cur = db.execute(
        "INSERT INTO admin_chat (user_email, sender, message, timestamp, read_by_admin) "
        "VALUES (?, ?, ?, ?, ?)",
        (user_email, sender, message, time.time(), 1 if sender == "admin" else 0),
    )
    db.commit()
    return cur.lastrowid

def get_admin_chat_messages(user_email, since_id=0):
    db = get_db()
    return db.execute(
        "SELECT * FROM admin_chat WHERE user_email = ? AND id > ? ORDER BY id ASC",
        (user_email, since_id),
    ).fetchall()

def mark_admin_chat_read(user_email):
    db = get_db()
    db.execute(
        "UPDATE admin_chat SET read_by_admin = 1 WHERE user_email = ? AND sender = 'user'",
        (user_email,),
    )
    db.commit()

def get_admin_chat_threads():
    db = get_db()
    rows = db.execute("""
        SELECT
            user_email,
            MAX(id) AS last_id,
            (SELECT message FROM admin_chat a2 WHERE a2.user_email = a1.user_email ORDER BY a2.id DESC LIMIT 1) AS last_message,
            (SELECT sender FROM admin_chat a3 WHERE a3.user_email = a1.user_email ORDER BY a3.id DESC LIMIT 1) AS last_sender,
            (SELECT timestamp FROM admin_chat a4 WHERE a4.user_email = a1.user_email ORDER BY a4.id DESC LIMIT 1) AS last_timestamp,
            SUM(CASE WHEN sender = 'user' AND read_by_admin = 0 THEN 1 ELSE 0 END) AS unread_count
        FROM admin_chat a1
        GROUP BY user_email
        ORDER BY last_timestamp DESC
    """).fetchall()
    return rows


# ---------------------- PUSH NOTIFICATION HELPERS ----------------------
def save_push_subscription(user_email, endpoint, p256dh, auth):
    db = get_db()
    db.execute(
        "INSERT INTO push_subscriptions (user_email, endpoint, p256dh, auth, created_at) "
        "VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(endpoint) DO UPDATE SET "
        "user_email = excluded.user_email, p256dh = excluded.p256dh, auth = excluded.auth",
        (user_email, endpoint, p256dh, auth, time.time()),
    )
    db.commit()

def get_push_subscriptions_for_user(user_email):
    db = get_db()
    return db.execute(
        "SELECT * FROM push_subscriptions WHERE user_email = ?", (user_email,)
    ).fetchall()

def delete_push_subscription(endpoint):
    db = get_db()
    db.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
    db.commit()


# ---------------------- DATA RETENTION ----------------------
def purge_old_data(days=180):
    db = get_db()
    cutoff = time.time() - (days * 86400)

    chat_deleted = db.execute(
        "DELETE FROM chat_history WHERE timestamp < ?", (cutoff,)
    ).rowcount
    admin_chat_deleted = db.execute(
        "DELETE FROM admin_chat WHERE timestamp < ?", (cutoff,)
    ).rowcount
    logs_deleted = db.execute(
        "DELETE FROM login_logs WHERE timestamp < ?", (cutoff,)
    ).rowcount

    db.commit()
    return {
        "chat_history_deleted": chat_deleted,
        "admin_chat_deleted": admin_chat_deleted,
        "login_logs_deleted": logs_deleted,
        "cutoff_days": days,
    }


# ---------------------- KILL SWITCH ----------------------
def kill_switch_wipe_everything():
    db = get_db()
    db.execute("DELETE FROM chat_history")
    db.execute("DELETE FROM admin_chat")
    db.execute("DELETE FROM login_logs")
    db.execute("DELETE FROM push_subscriptions")
    db.execute("DELETE FROM users")
    db.commit()