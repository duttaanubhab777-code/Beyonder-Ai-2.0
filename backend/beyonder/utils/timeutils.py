import time
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))

def now() -> float:
    return time.time()

def fmt_ist(ts) -> str:
    try:
        return datetime.fromtimestamp(float(ts), tz=IST).strftime("%Y-%m-%d %I:%M:%S %p IST")
    except Exception:
        return "-"

def iso_now() -> str:
    return datetime.now(tz=IST).isoformat()
