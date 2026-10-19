"""Web Push (VAPID). Optional: if pywebpush or the keys are missing, it just does nothing."""
from __future__ import annotations

import json

from beyonder.database import push_subscriptions
from beyonder.settings import get_settings

try:
    from pywebpush import WebPushException, webpush
except Exception:
    webpush = None
    WebPushException = Exception


def available():
    return webpush is not None and get_settings().push_enabled


def _send(sub, payload):
    s = get_settings()
    try:
        webpush(
            subscription_info={
                "endpoint": sub["endpoint"],
                "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
            },
            data=json.dumps(payload),
            vapid_private_key=s.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": s.VAPID_CLAIM_EMAIL},
            timeout=6,
        )
        return True
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in (404, 410):
            push_subscriptions.delete(sub["endpoint"])
    except Exception:
        pass
    return False


def send_to_user(email, title, body, url="index.html"):
    if not available():
        return 0
    payload = {"title": title, "body": body[:150], "url": url}
    return sum(1 for sub in push_subscriptions.for_user(email) if _send(sub, payload))


def send_to_emails(emails, title, body, url="index.html", cap=300):
    if not available():
        return 0
    payload = {"title": title, "body": body[:150], "url": url}
    wanted = set(emails)
    sent = 0
    for sub in push_subscriptions.all_subscriptions():
        if sub["user_email"] in wanted:
            if _send(sub, payload):
                sent += 1
            if sent >= cap:
                break
    return sent
