"""Tiny periodic cleanup, triggered now and then by normal traffic."""
from __future__ import annotations

import random
import time

from beyonder.database import auth_tokens, otp_codes, rate_limits


def maybe_run(probability=0.02):
    if random.random() > probability:
        return
    now = time.time()
    auth_tokens.prune_expired(now)
    otp_codes.prune(now)
    rate_limits.prune(now - 86400)
