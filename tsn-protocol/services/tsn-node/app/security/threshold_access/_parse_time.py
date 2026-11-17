from __future__ import annotations

from typing import Any
from ._require_string import _require_string
from datetime import datetime
from datetime import timezone

def _parse_time(value: Any, label: str) -> datetime:
    from .types import ThresholdAccessError
    text = _require_string(value, label)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ThresholdAccessError(f"{label} is invalid") from exc
    if parsed.tzinfo is None:
        raise ThresholdAccessError(f"{label} must include a timezone")
    return parsed.astimezone(timezone.utc)
