"""field implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from security.cryptography.gpru_contract import BABYJUB_FIELD
import re

def field(value: Any) -> int:
    if type(value) is int:
        number = value
    elif isinstance(value, str) and re.fullmatch(r"0|[1-9][0-9]*", value):
        number = int(value)
    else:
        raise ValueError("Hidden-head witness fields must be canonical decimal integers")
    if not 0 <= number < BABYJUB_FIELD:
        raise ValueError("Hidden-head witness field is outside BN254")
    return number
