"""_tcap_credit_bytes32: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
import re
from typing import Any, Callable, Protocol



def _tcap_credit_bytes32(value: Any, label: str) -> bytes:
    text = str(value or "").lower()
    if not re.fullmatch(r"[0-9a-f]{64}", text):
        raise ValueError(f"TCAP credit {label} must be 32-byte hex")
    return bytes.fromhex(text)
