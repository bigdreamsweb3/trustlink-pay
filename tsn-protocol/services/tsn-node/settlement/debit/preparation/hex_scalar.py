"""hex_scalar: private preparation component; validates the canonical debit contract.

Inputs, outputs and failure predicates are defined by the typed implementation.
Dependencies are explicit imports; no service state or RPC is accessed.
"""
from __future__ import annotations
from typing import Any
import re
from .scalar import scalar


def hex_scalar(value: Any, *, nonzero: bool = False) -> int:
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
        raise ValueError("Transfer field requires canonical 32-byte lowercase hex")
    return scalar(int(value, 16), nonzero=nonzero)
