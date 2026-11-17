from __future__ import annotations

from typing import Any

def _require_string(value: Any, label: str) -> str:
    from .types import ThresholdAccessError
    if not isinstance(value, str) or not value:
        raise ThresholdAccessError(f"{label} is required")
    return value
