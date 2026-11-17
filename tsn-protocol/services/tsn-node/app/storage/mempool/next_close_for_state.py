from __future__ import annotations

from app import config
from datetime import datetime
from .parse_iso import parse_iso
from datetime import timezone

def next_close_for_state(state: dict) -> datetime:
    started_dt = parse_iso(state["started_at"])
    return datetime.fromtimestamp(started_dt.timestamp() + config.EPOCH_SECS, tz=timezone.utc)
