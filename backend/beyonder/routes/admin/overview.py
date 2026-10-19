from __future__ import annotations

import time

from beyonder.database import app_settings, auth_tokens, stats, support, users
from beyonder.middleware.auth import admin_required
from beyonder.settings import get_settings
from beyonder.utils.responses import ok

from . import admin_bp


def _online_list():
    names = users.names_by_email()
    rows = auth_tokens.online(time.time(), get_settings().PRESENCE_ONLINE_WINDOW_SECONDS)
    return [
        {"email": r["user_email"], "name": names.get(r["user_email"], r["user_email"]),
         "last_seen": r["last_seen"]}
        for r in rows
    ]


@admin_bp.get("/overview")
@admin_required
def overview():
    online = _online_list()
    return ok(
        stats=stats.overview(time.time()),
        online_users=online,
        online_count=len(online),
        support_unread=support.unread_total(),
        settings=app_settings.get_all(),
    )


@admin_bp.get("/online")
@admin_required
def online():
    items = _online_list()
    return ok(online_users=items, count=len(items))
