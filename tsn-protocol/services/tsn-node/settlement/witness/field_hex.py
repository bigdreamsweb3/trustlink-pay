"""field_hex implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from settlement.witness.field import field
import re

def field_hex(value: Any) -> int:
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
        raise ValueError("Hidden-head commitment must be canonical 32-byte hex")
    return field(int(value, 16))
