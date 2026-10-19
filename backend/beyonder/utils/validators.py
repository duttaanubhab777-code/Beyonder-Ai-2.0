import re

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
SESSION_ID_REGEX = re.compile(r"^[A-Za-z0-9_\-]{1,80}$")

def clean_email(value):
    return value.strip().lower() if isinstance(value, str) else ""

def is_valid_email(email):
    return bool(email) and len(email) <= 254 and bool(EMAIL_REGEX.match(email))

def clean_text(value, max_len):
    if not isinstance(value, str):
        return ""
    return value.strip()[:max_len]

def clean_session_id(value):
    if isinstance(value, str) and SESSION_ID_REGEX.match(value):
        return value
    return "default_session"

def to_int(value, default, minimum=None, maximum=None):
    try:
        n = int(value)
    except (TypeError, ValueError):
        n = default
    if minimum is not None:
        n = max(minimum, n)
    if maximum is not None:
        n = min(maximum, n)
    return n
