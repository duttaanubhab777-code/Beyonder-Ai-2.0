from __future__ import annotations

import os
import platform
import sys
import tempfile
import time
from datetime import datetime

from flask import current_app, g, request, send_file

from beyonder.database import app_settings, maintenance, push_subscriptions
from beyonder.middleware.auth import admin_required
from beyonder.services import auth_service, push_service
from beyonder.settings import get_settings
from beyonder.utils.request_info import client_ip
from beyonder.utils.responses import fail, ok
from beyonder.utils.timeutils import iso_now
from beyonder.utils.validators import clean_text, to_int

from . import admin_bp
from .helpers import record

KILL_PHRASE = "DELETE EVERYTHING"
_LEVELS = {"info", "warning", "success"}


@admin_bp.get("/settings")
@admin_required
def get_settings_view():
    return ok(settings=app_settings.get_all())


@admin_bp.post("/settings")
@admin_required
def update_settings():
    data = request.get_json(silent=True) or {}
    changed = []

    for key in ("registration_open", "maintenance_mode"):
        if key in data:
            app_settings.set_value(key, "1" if data[key] in (True, 1, "1", "true") else "0")
            changed.append(f"{key}={app_settings.get(key)}")
    if "announcement" in data:
        app_settings.set_value("announcement", clean_text(data["announcement"], 300))
        changed.append("announcement")
    if "announcement_level" in data and data["announcement_level"] in _LEVELS:
        app_settings.set_value("announcement_level", data["announcement_level"])
    if "maintenance_message" in data:
        text = clean_text(data["maintenance_message"], 300)
        if text:
            app_settings.set_value("maintenance_message", text)

    record("settings.update", "", ", ".join(changed))
    return ok("Settings saved.", settings=app_settings.get_all())


@admin_bp.get("/system/info")
@admin_required
def system_info():
    s = get_settings()
    path = s.DB_PATH
    size = os.path.getsize(path) if os.path.exists(path) else 0
    return ok(
        db_path=path, db_size_bytes=size, tables=maintenance.table_counts(),
        python=sys.version.split()[0], platform=platform.platform(),
        admins=sorted(s.ADMIN_EMAILS),
        mail_configured=s.mail_enabled,
        push_configured=push_service.available(),
        push_devices=push_subscriptions.count(),
        kill_switch_enabled=bool(s.KILL_SWITCH_PASSWORD),
        webhook_enabled=bool(s.WEBHOOK_SECRET),
        server_time=iso_now(),
    )


@admin_bp.post("/system/purge")
@admin_required
def purge():
    data = request.get_json(silent=True) or {}
    days = to_int(data.get("days"), 180, minimum=1)
    result = maintenance.purge_old_data(days)
    record("system.purge", "", f"older than {days} days")
    return ok("Old data removed.", deleted=result)


@admin_bp.post("/system/vacuum")
@admin_required
def vacuum():
    maintenance.vacuum()
    record("system.vacuum")
    return ok("Database compacted.")


@admin_bp.get("/system/backup")
@admin_required
def backup():
    """Download a consistent copy of the whole database."""
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
    tmp.close()
    maintenance.backup_to(tmp.name)
    record("system.backup")
    name = f"beyonder-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.db"
    response = send_file(tmp.name, as_attachment=True, download_name=name,
                         mimetype="application/octet-stream")
    response.call_on_close(lambda: os.path.exists(tmp.name) and os.remove(tmp.name))
    return response


@admin_bp.post("/system/kill-switch")
@admin_required
def kill_switch():
    s = get_settings()
    if not s.KILL_SWITCH_PASSWORD:
        return fail("Kill switch is disabled. Set KILL_SWITCH_PASSWORD in config.py to enable it.", 403)
    data = request.get_json(silent=True) or {}
    if clean_text(data.get("confirm_text"), 50) != KILL_PHRASE:
        return fail(f'Type "{KILL_PHRASE}" exactly to confirm.')
    if (data.get("password") or "") != s.KILL_SWITCH_PASSWORD:
        record("system.kill_switch_denied")
        return fail("Incorrect kill-switch password.", 401)

    record("system.kill_switch", "", "ALL DATA WIPED")
    maintenance.wipe_everything()
    return ok("Everything was deleted: all accounts, chats, logs and sessions.")
