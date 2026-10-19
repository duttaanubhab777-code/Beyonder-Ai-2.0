from __future__ import annotations

from .connection import get_db

DEFAULTS = {
    "registration_open": "1",
    "maintenance_mode": "0",
    "maintenance_message": "Beyonder AI is under maintenance. Please try again shortly.",
    "announcement": "",
    "announcement_level": "info",
}


def get_all():
    data = dict(DEFAULTS)
    for r in get_db().execute("SELECT key, value FROM app_settings").fetchall():
        data[r["key"]] = r["value"]
    return data


def get(key):
    row = get_db().execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else DEFAULTS.get(key, "")


def set_value(key, value):
    db = get_db()
    db.execute(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, str(value)),
    )
    db.commit()
