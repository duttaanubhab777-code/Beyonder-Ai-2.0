from __future__ import annotations

import os
import sqlite3
import time

from .connection import get_db


def purge_old_data(days):
    db = get_db()
    cutoff = time.time() - days * 86400
    result = {
        "chat_history_deleted": db.execute("DELETE FROM chat_history WHERE timestamp < ?", (cutoff,)).rowcount,
        "support_messages_deleted": db.execute("DELETE FROM admin_chat WHERE timestamp < ?", (cutoff,)).rowcount,
        "login_logs_deleted": db.execute("DELETE FROM login_logs WHERE timestamp < ?", (cutoff,)).rowcount,
        "audit_deleted": db.execute("DELETE FROM audit_log WHERE timestamp < ?", (cutoff,)).rowcount,
        "cutoff_days": days,
    }
    db.commit()
    return result


def wipe_everything():
    db = get_db()
    for table in ("chat_history", "admin_chat", "login_logs", "push_subscriptions",
                  "auth_tokens", "otp_codes", "rate_limits", "notifications", "users"):
        db.execute(f"DELETE FROM {table}")
    db.commit()


def vacuum():
    db = get_db()
    db.commit()
    db.execute("VACUUM")


def backup_to(dest_path):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    src = get_db()
    dst = sqlite3.connect(dest_path)
    try:
        src.backup(dst)
    finally:
        dst.close()


def table_counts():
    db = get_db()
    out = {}
    for table in ("users", "chat_history", "admin_chat", "login_logs", "auth_tokens",
                  "push_subscriptions", "notifications", "audit_log"):
        out[table] = db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    return out
