"""next_close_for_state: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    EPOCH_SECS: Any
    parse_iso: Callable[..., Any]


def next_close_for_state(node: Dependencies, state: dict) -> datetime:
    started_dt = node.parse_iso(state["started_at"])
    return datetime.fromtimestamp(started_dt.timestamp() + node.EPOCH_SECS, tz=timezone.utc)
