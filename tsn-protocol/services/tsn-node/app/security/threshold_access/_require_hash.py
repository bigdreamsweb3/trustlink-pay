from __future__ import annotations

from typing import Any
from ._require_string import _require_string

def _require_hash(value: Any, label: str) -> str:
    from .types import ThresholdAccessError
    text = _require_string(value, label).lower()
    if len(text) != 64 or any(character not in "0123456789abcdef" for character in text):
        raise ThresholdAccessError(f"{label} must be a 32-byte hexadecimal commitment")
    return text
