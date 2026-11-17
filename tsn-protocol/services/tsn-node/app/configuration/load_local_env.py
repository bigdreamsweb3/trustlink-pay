from __future__ import annotations

from pathlib import Path
import os

def load_local_env() -> None:
    """Load ignored local env files before configuration constants are read."""
    root = Path(__file__).resolve().parents[2]
    for filename in (".env.local", ".env"):
        path = root / filename
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key, value = key.strip(), value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)
