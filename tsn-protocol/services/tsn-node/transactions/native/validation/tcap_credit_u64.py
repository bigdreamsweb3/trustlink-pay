"""_tcap_credit_u64: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
from typing import Any, Callable, Protocol



def _tcap_credit_u64(value: Any, label: str) -> bytes:
    number = int(str(value))
    if number < 0 or number > 0xFFFFFFFFFFFFFFFF:
        raise ValueError(f"TCAP credit {label} is out of range")
    return number.to_bytes(8, "little")
