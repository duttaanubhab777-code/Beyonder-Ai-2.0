"""Admin API  ->  /api/admin/*   (admins = emails listed in ADMIN_EMAILS in config.py)"""
from flask import Blueprint

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

from . import broadcast, chats, logs, overview, support, system, users  # noqa: E402,F401
