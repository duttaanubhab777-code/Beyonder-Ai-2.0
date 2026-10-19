"""Request hooks: maintenance mode, security headers, cache rules."""
from __future__ import annotations

from flask import request

from beyonder.database import app_settings
from beyonder.services import auth_service
from beyonder.utils.responses import fail

_OPEN_PATHS = (
    "/api/health", "/api/public-config", "/api/login", "/api/me",
    "/api/logout", "/api/webhook",
)


def register_hooks(app):
    @app.before_request
    def maintenance_gate():
        path = request.path
        if not path.startswith("/api/") or request.method == "OPTIONS":
            return None
        if path in _OPEN_PATHS or path.startswith("/api/admin/"):
            return None
        if app_settings.get("maintenance_mode") != "1":
            return None
        session = auth_service.resolve(request.headers.get("Authorization", ""))
        if session and session["is_admin"]:
            return None
        return fail(app_settings.get("maintenance_message"), 503, code="maintenance")

    @app.after_request
    def security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        elif response.mimetype in ("text/html", "text/css", "application/javascript",
                                   "text/javascript", "application/json"):
            response.headers["Cache-Control"] = "no-cache"
        return response
