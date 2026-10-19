from __future__ import annotations

from datetime import datetime, timedelta

from beyonder.utils.timeutils import IST

from .connection import get_db

IST_OFFSET = 19800


def _scalar(sql, params=()):
    return get_db().execute(sql, params).fetchone()[0]


def _series(table, column, since, days, where=""):
    rows = get_db().execute(
        f"SELECT date({column} + {IST_OFFSET}, 'unixepoch') AS d, COUNT(*) AS n "
        f"FROM {table} WHERE {column} >= ? {where} GROUP BY d",
        (since,),
    ).fetchall()
    found = {r["d"]: r["n"] for r in rows}
    today = datetime.now(tz=IST).date()
    out = []
    for i in range(days - 1, -1, -1):
        day = (today - timedelta(days=i)).isoformat()
        out.append({"date": day, "count": found.get(day, 0)})
    return out


def overview(now, days=14):
    day = 86400
    since_series = now - days * day
    return {
        "users_total": _scalar("SELECT COUNT(*) FROM users"),
        "users_new_24h": _scalar("SELECT COUNT(*) FROM users WHERE created_at >= ?", (now - day,)),
        "users_new_7d": _scalar("SELECT COUNT(*) FROM users WHERE created_at >= ?", (now - 7 * day,)),
        "users_banned": _scalar("SELECT COUNT(*) FROM users WHERE is_banned = 1"),
        "messages_total": _scalar("SELECT COUNT(*) FROM chat_history WHERE source = 'ai'"),
        "messages_24h": _scalar(
            "SELECT COUNT(*) FROM chat_history WHERE source = 'ai' AND timestamp >= ?", (now - day,)
        ),
        "failed_logins_24h": _scalar(
            "SELECT COUNT(*) FROM login_logs WHERE success = 0 AND timestamp >= ?", (now - day,)
        ),
        "active_sessions": _scalar("SELECT COUNT(*) FROM auth_tokens WHERE expires_at > ?", (now,)),
        "push_devices": _scalar("SELECT COUNT(*) FROM push_subscriptions"),
        "signups_series": _series("users", "created_at", since_series, days),
        "messages_series": _series("chat_history", "timestamp", since_series, days, "AND source = 'ai'"),
    }
