"""Beyonder AI backend - Flask application factory."""
from __future__ import annotations

from flask import Flask, send_from_directory
from flask_cors import CORS

from .database import schema
from .database.connection import close_db
from .middleware.hooks import register_hooks
from .routes import register_routes
from .settings import FRONTEND_DIR, get_settings


def create_app():
    settings = get_settings()
    serve_frontend = settings.SERVE_FRONTEND and FRONTEND_DIR.is_dir()

    app = Flask(
        __name__,
        static_folder=str(FRONTEND_DIR) if serve_frontend else None,
        static_url_path="" if serve_frontend else "/static",
    )
    app.config["SECRET_KEY"] = settings.SECRET_KEY
    app.config["DB_PATH"] = settings.DB_PATH
    app.config["JSON_AS_ASCII"] = False
    app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024          # 2 MB request limit

    CORS(
        app,
        resources={r"/api/*": {"origins": settings.ALLOWED_ORIGINS or "*"}},
        allow_headers=["Content-Type", "Authorization"],
        expose_headers=["Content-Disposition"],
        supports_credentials=False,
    )

    schema.init_db(settings.DB_PATH)
    app.teardown_appcontext(close_db)
    register_hooks(app)
    register_routes(app)

    if serve_frontend:
        @app.route("/")
        def frontend_index():
            return send_from_directory(app.static_folder, "index.html")

    return app
