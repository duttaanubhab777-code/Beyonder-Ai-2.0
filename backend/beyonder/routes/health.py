from __future__ import annotations

import time

from flask import Blueprint

from beyonder.database import app_settings
from beyonder.services import push_service
from beyonder.utils.responses import ok

bp = Blueprint("health", __name__, url_prefix="/api")


@bp.get("/health")
def health():
    return ok(status="ok", time=time.time())


@bp.get("/public-config")
def public_config():
    s = app_settings.get_all()
    return ok(
        announcement=s["announcement"],
        announcement_level=s["announcement_level"],
        maintenance=s["maintenance_mode"] == "1",
        maintenance_message=s["maintenance_message"],
        registration_open=s["registration_open"] == "1",
        push_available=push_service.available(),
    )
