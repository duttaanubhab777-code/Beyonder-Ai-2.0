"""Route decorators: login_required and admin_required."""
from __future__ import annotations

from functools import wraps

from flask import g, request

from beyonder.services import auth_service
from beyonder.utils.responses import fail


def _authenticate():
    session = auth_service.resolve(request.headers.get("Authorization", ""))
    if not session:
        return None
    g.user_email = session["email"]
    g.token_hash = session["token_hash"]
    g.is_admin = session["is_admin"]
    g.impersonated_by = session["impersonated_by"]
    return session


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not _authenticate():
            return fail("Login required.", 401, code="auth")
        return view(*args, **kwargs)
    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not _authenticate():
            return fail("Login required.", 401, code="auth")
        if not g.is_admin or g.impersonated_by:
            return fail("Admin access only.", 403, code="forbidden")
        return view(*args, **kwargs)
    return wrapped
