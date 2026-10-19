"""Database-backed rate limiting (survives restarts, works with many workers)."""
from __future__ import annotations

import time

from beyonder.database import rate_limits


def is_limited(bucket, max_attempts, window_seconds):
    return rate_limits.count(bucket, time.time() - window_seconds) >= max_attempts


def record(bucket):
    rate_limits.hit(bucket, time.time())


def clear(bucket):
    rate_limits.clear(bucket)
