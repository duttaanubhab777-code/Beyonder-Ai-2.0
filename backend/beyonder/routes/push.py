from __future__ import annotations

from flask import Blueprint, g, request

from beyonder.database import push_subscriptions
from beyonder.middleware.auth import login_required
from beyonder.services import push_service
from beyonder.settings import get_settings
from beyonder.utils.responses import fail, ok

bp = Blueprint("push", __name__, url_prefix="/api/push")


@bp.get("/vapid-public-key")
def vapid_public_key():
    if not push_service.available():
        return fail("Push notifications are not configured on this server.", 503)
    return ok(publicKey=get_settings().VAPID_PUBLIC_KEY)


@bp.post("/subscribe")
@login_required
def subscribe():
    if not push_service.available():
        return fail("Push notifications are not configured on this server.", 503)
    data = request.get_json(silent=True) or {}
    keys = data.get("keys") or {}
    endpoint = str(data.get("endpoint") or "").strip()
    p256dh = str(keys.get("p256dh") or "").strip()
    auth = str(keys.get("auth") or "").strip()
    if not (endpoint and p256dh and auth):
        return fail("Incomplete push subscription.")
    push_subscriptions.save(g.user_email, endpoint, p256dh, auth)
    return ok()


@bp.post("/unsubscribe")
@login_required
def unsubscribe():
    data = request.get_json(silent=True) or {}
    endpoint = str(data.get("endpoint") or "").strip()
    if endpoint:
        push_subscriptions.delete(endpoint)
    return ok()
