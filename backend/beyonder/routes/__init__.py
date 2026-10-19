from __future__ import annotations

from . import auth, chat, health, profile, push, support, webhook
from .admin import admin_bp


def register_routes(app):
    for module in (health, auth, profile, chat, support, push, webhook):
        app.register_blueprint(module.bp)
    app.register_blueprint(admin_bp)
