"""One-time-password flow shared by signup and forgot-password."""
from __future__ import annotations

import json
import time

from beyonder.database import otp_codes
from beyonder.settings import get_settings

from . import mailer, rate_limit, security


class OtpError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def _key(purpose, email):
    return f"{purpose}:{email}"


def issue(purpose, email, ip, payload=None):
    s = get_settings()
    now = time.time()

    ip_bucket = f"otp-send:{ip}"
    if rate_limit.is_limited(ip_bucket, s.OTP_SEND_MAX_PER_HOUR_PER_IP, 3600):
        raise OtpError("Too many code requests. Please try again later.", 429)

    key = _key(purpose, email)
    existing = otp_codes.get(key)
    if existing and now - existing["last_sent"] < s.OTP_RESEND_COOLDOWN_SECONDS:
        wait = int(s.OTP_RESEND_COOLDOWN_SECONDS - (now - existing["last_sent"])) + 1
        raise OtpError(f"Please wait {wait} seconds before requesting another code.", 429)

    code = security.new_otp()
    otp_codes.upsert(
        key, purpose, email,
        security.hash_otp(email, code),
        json.dumps(payload) if payload else None,
        now + s.OTP_EXPIRY_SECONDS, now,
    )
    rate_limit.record(ip_bucket)

    try:
        mailer.send_otp_email(email, code, purpose)
    except Exception:
        otp_codes.delete(key)
        raise OtpError("Could not send the verification email. Please try again.", 500)

    return {"expires_in": s.OTP_EXPIRY_SECONDS, "resend_after": s.OTP_RESEND_COOLDOWN_SECONDS}


def verify(purpose, email, code):
    s = get_settings()
    key = _key(purpose, email)
    record = otp_codes.get(key)
    if not record:
        raise OtpError("No pending request found. Please start again.", 400)

    if time.time() > record["expires_at"]:
        otp_codes.delete(key)
        raise OtpError("This verification code has expired. Please request a new one.", 400)

    attempts = otp_codes.bump_attempts(key)
    if attempts > s.OTP_MAX_VERIFY_ATTEMPTS:
        otp_codes.delete(key)
        raise OtpError("Too many incorrect attempts. Please request a new code.", 429)

    if not security.safe_equal(record["otp_hash"], security.hash_otp(email, code)):
        raise OtpError("Incorrect verification code.", 400)

    otp_codes.delete(key)
    return json.loads(record["payload"]) if record["payload"] else {}
