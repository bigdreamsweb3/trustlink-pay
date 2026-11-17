"""is_epoch_due: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    next_close_for_state: Callable[..., Any]


def is_epoch_due(node: Dependencies, state: dict) -> bool:
    return datetime.now(timezone.utc) >= node.next_close_for_state(state)
