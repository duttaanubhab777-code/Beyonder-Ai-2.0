"""Token / OTP generation and hashing. Raw tokens and OTPs are never stored."""
from __future__ import annotations

import hashlib
import hmac
import secrets

from beyonder.settings import get_settings


def _hmac(text):
    key = get_settings().SECRET_KEY.encode("utf-8")
    return hmac.new(key, text.encode("utf-8"), hashlib.sha256).hexdigest()


def new_token():
    return secrets.token_urlsafe(32)


def hash_token(raw):
    return _hmac("token:" + raw)


def new_otp():
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(email, otp):
    return _hmac(f"otp:{email}:{otp}")


def safe_equal(a, b):
    return hmac.compare_digest(str(a), str(b))
