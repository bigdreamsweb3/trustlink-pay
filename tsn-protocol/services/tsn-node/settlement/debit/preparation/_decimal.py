"""_decimal: private preparation component; validates the canonical debit contract.

Inputs, outputs and failure predicates are defined by the typed implementation.
Dependencies are explicit imports; no service state or RPC is accessed.
"""
from __future__ import annotations
from typing import Any
import re
from .uint import uint


def _decimal(value: Any, bits: int, *, positive: bool = False) -> int:
    if not isinstance(value, str) or not re.fullmatch(r"0|[1-9][0-9]*", value):
        raise ValueError("Transfer opening integer encoding is not canonical")
    return uint(int(value), bits, positive=positive)
