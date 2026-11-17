from __future__ import annotations

from datetime import datetime
from .next_close_for_state import next_close_for_state
from datetime import timezone

def is_epoch_due(state: dict) -> bool:
    return datetime.now(timezone.utc) >= next_close_for_state(state)
