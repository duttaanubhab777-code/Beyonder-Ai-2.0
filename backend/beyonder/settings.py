from __future__ import annotations
import importlib
import sys
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import FrozenSet, List

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BASE_DIR.parent
FRONTEND_DIR = PROJECT_DIR / "frontend"

_PLACEHOLDER_SECRETS = {"", "PUT-A-LONG-RANDOM-STRING-HERE", "change-me"}

def _load_user_config():
    if str(BASE_DIR) not in sys.path:
        sys.path.insert(0, str(BASE_DIR))
    try:
        return importlib.import_module("config")
    except ModuleNotFoundError as exc:
        if exc.name != "config":
            raise
        raise RuntimeError("config.py not found in backend folder.") from None

@dataclass(frozen=True)
class Settings:
    SECRET_KEY: str
    ADMIN_EMAILS: FrozenSet[str]
    DB_PATH: str
    GMAIL_ADDRESS: str = ""
    GMAIL_APP_PASSWORD: str = ""
    OTP_EXPIRY_SECONDS: int = 600
    OTP_RESEND_COOLDOWN_SECONDS: int = 60
    OTP_MAX_VERIFY_ATTEMPTS: int = 5
    TOKEN_MAX_AGE_SECONDS: int = 30 * 24 * 60 * 60
    IMPERSONATION_MAX_AGE_SECONDS: int = 60 * 60
    PRESENCE_ONLINE_WINDOW_SECONDS: int = 90
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_ATTEMPT_WINDOW_SECONDS: int = 15 * 60
    CHAT_HISTORY_LIMIT: int = 300
    ALLOWED_ORIGINS: List[str] = field(default_factory=list)
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_CLAIM_EMAIL: str = "mailto:admin@example.com"
    KILL_SWITCH_PASSWORD: str = ""
    WEBHOOK_SECRET: str = ""
    PYTHONANYWHERE_WSGI_FILE: str = ""
    SERVE_FRONTEND: bool = True

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    cfg = _load_user_config()
    g = lambda name, default: getattr(cfg, name, default)
    secret = str(g("SECRET_KEY", "") or "")
    if secret in _PLACEHOLDER_SECRETS:
        raise RuntimeError("SECRET_KEY in config.py is empty.")
    admins = frozenset(str(e).strip().lower() for e in (g("ADMIN_EMAILS", []) or []) if str(e).strip())
    default_db = BASE_DIR / "data" / "beyonder.db"
    db_path = str(g("DB_PATH", "") or default_db)
    return Settings(
        SECRET_KEY=secret,
        ADMIN_EMAILS=admins,
        DB_PATH=db_path,
        GMAIL_ADDRESS=str(g("GMAIL_ADDRESS", "") or ""),
        GMAIL_APP_PASSWORD=str(g("GMAIL_APP_PASSWORD", "") or ""),
        OTP_EXPIRY_SECONDS=int(g("OTP_EXPIRY_SECONDS", 600)),
        OTP_RESEND_COOLDOWN_SECONDS=int(g("OTP_RESEND_COOLDOWN_SECONDS", 60)),
        OTP_MAX_VERIFY_ATTEMPTS=int(g("OTP_MAX_VERIFY_ATTEMPTS", 5)),
        TOKEN_MAX_AGE_SECONDS=int(g("TOKEN_MAX_AGE_SECONDS", 30 * 24 * 60 * 60)),
        PRESENCE_ONLINE_WINDOW_SECONDS=int(g("PRESENCE_ONLINE_WINDOW_SECONDS", 90)),
        LOGIN_MAX_ATTEMPTS=int(g("LOGIN_MAX_ATTEMPTS", 5)),
        LOGIN_ATTEMPT_WINDOW_SECONDS=int(g("LOGIN_ATTEMPT_WINDOW_SECONDS", 15 * 60)),
        CHAT_HISTORY_LIMIT=int(g("CHAT_HISTORY_LIMIT", 300)),
        ALLOWED_ORIGINS=list(g("ALLOWED_ORIGINS", []) or []),
        VAPID_PUBLIC_KEY=str(g("VAPID_PUBLIC_KEY", "") or ""),
        VAPID_PRIVATE_KEY=str(g("VAPID_PRIVATE_KEY", "") or ""),
        VAPID_CLAIM_EMAIL=str(g("VAPID_CLAIM_EMAIL", "mailto:admin@example.com")),
        KILL_SWITCH_PASSWORD=str(g("KILL_SWITCH_PASSWORD", "") or ""),
        WEBHOOK_SECRET=str(g("WEBHOOK_SECRET", "") or ""),
        PYTHONANYWHERE_WSGI_FILE=str(g("PYTHONANYWHERE_WSGI_FILE", "") or ""),
        SERVE_FRONTEND=bool(g("SERVE_FRONTEND", True)),
    )
