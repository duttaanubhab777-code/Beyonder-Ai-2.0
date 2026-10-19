"""GitHub webhook -> git pull + reload. Accepts GitHub's HMAC signature or X-Webhook-Secret."""
from __future__ import annotations

import hashlib
import hmac

from flask import Blueprint, request

from beyonder.services import deploy_service
from beyonder.settings import get_settings
from beyonder.utils.responses import fail, ok

bp = Blueprint("webhook", __name__, url_prefix="/api")


def _authorized(secret):
    signature = request.headers.get("X-Hub-Signature-256", "")
    if signature.startswith("sha256="):
        expected = "sha256=" + hmac.new(secret.encode(), request.get_data(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(signature, expected)
    provided = request.headers.get("X-Webhook-Secret", "")
    return bool(provided) and hmac.compare_digest(provided, secret)


@bp.post("/webhook")
def webhook():
    secret = get_settings().WEBHOOK_SECRET
    if not secret or not _authorized(secret):
        return fail("Unauthorized.", 401)

    event = request.headers.get("X-GitHub-Event", "")
    if event == "ping":
        return ok("pong")
    if event and event != "push":
        return ok(f"Ignored '{event}' event.")

    try:
        result = deploy_service.pull_and_reload()
    except Exception as exc:
        return fail(f"Deploy failed: {exc}", 500)
    return ok("Deploy finished." if result["ok"] else "git pull failed.", **result)
