# db.py
# -----------------------------------------------------------------
# SQLite ডাটাবেস হ্যান্ডলিং — ইউজার অ্যাকাউন্ট, চ্যাট হিস্ট্রি, লগইন লগ,
# সব এখানেই একটা সিঙ্গেল ফাইলে (beyonder.db) থাকে। PythonAnywhere-এর
# ফ্রি প্ল্যানে এটা কোনো এক্সট্রা সার্ভিস (Postgres/MySQL) ছাড়াই কাজ করে।
# -----------------------------------------------------------------

import sqlite3
import time
from flask import g

DB_PATH = "beyonder.db"


def get_db():
    """Request-context-এ একটাই কানেকশন রাখা হয়, request শেষ হলে বন্ধ হয়ে যায়।"""
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH, timeout=10, check_same_thread=False)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(e=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """অ্যাপ স্টার্ট হওয়ার সময় টেবিলগুলো (না থাকলে) তৈরি করে দেয়।"""
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
            last_login_at   REAL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email      TEXT NOT NULL,
            user_message    TEXT NOT NULL,
            ai_response     TEXT NOT NULL,
            timestamp       REAL NOT NULL
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


def get_all_users():
    db = get_db()
    return db.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()


def delete_user(email):
    db = get_db()
    db.execute("DELETE FROM users WHERE email = ?", (email,))
    db.commit()


# ---------------------- CHAT HELPERS ----------------------

def save_chat(user_email, user_message, ai_response):
    db = get_db()
    db.execute(
        "INSERT INTO chat_history (user_email, user_message, ai_response, timestamp) VALUES (?, ?, ?, ?)",
        (user_email, user_message, ai_response, time.time()),
    )
    db.commit()


def get_all_chats(limit=500):
    db = get_db()
    return db.execute(
        "SELECT * FROM chat_history ORDER BY timestamp DESC LIMIT ?", (limit,)
    ).fetchall()


def get_chats_for_user(email, limit=500):
    db = get_db()
    return db.execute(
        "SELECT * FROM chat_history WHERE user_email = ? ORDER BY timestamp DESC LIMIT ?",
        (email, limit),
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