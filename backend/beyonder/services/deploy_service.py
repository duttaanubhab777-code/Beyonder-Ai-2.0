"""GitHub -> PythonAnywhere auto deploy: `git pull`, then reload the web app."""
from __future__ import annotations

import subprocess
from pathlib import Path

from beyonder.settings import PROJECT_DIR, get_settings


def pull_and_reload():
    result = subprocess.run(
        ["git", "-C", str(PROJECT_DIR), "pull", "--ff-only"],
        capture_output=True, text=True, timeout=90,
    )
    output = (result.stdout or "") + (result.stderr or "")

    reloaded = False
    wsgi_file = get_settings().PYTHONANYWHERE_WSGI_FILE
    if result.returncode == 0 and wsgi_file:
        try:
            Path(wsgi_file).touch()
            reloaded = True
        except OSError:
            pass

    return {"ok": result.returncode == 0, "reloaded": reloaded, "output": output.strip()[-800:]}
