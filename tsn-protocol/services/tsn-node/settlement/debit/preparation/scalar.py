"""scalar: private preparation component; validates the canonical debit contract.

Inputs, outputs and failure predicates are defined by the typed implementation.
Dependencies are explicit imports; no service state or RPC is accessed.
"""
from __future__ import annotations
from security.cryptography.gpru_contract import BABYJUB_FIELD
from typing import Any
import re


def scalar(value: Any, *, nonzero: bool = False) -> int:
    if type(value) is int:
        number = value
    elif isinstance(value, str) and re.fullmatch(r"0|[1-9][0-9]*", value):
        number = int(value)
    else:
        raise ValueError("Transfer scalar encoding is not canonical")
    if not int(nonzero) <= number < BABYJUB_FIELD:
        raise ValueError("Transfer scalar is out of range")
    return number
