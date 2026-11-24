"""uint: private preparation component; validates the canonical debit contract.

Inputs, outputs and failure predicates are defined by the typed implementation.
Dependencies are explicit imports; no service state or RPC is accessed.
"""
from __future__ import annotations
from typing import Any


def uint(value: Any, bits: int, *, positive: bool = False) -> int:
    if type(value) is not int or not int(positive) <= value < 1 << bits:
        raise ValueError("Transfer integer is outside its unsigned range")
    return value
