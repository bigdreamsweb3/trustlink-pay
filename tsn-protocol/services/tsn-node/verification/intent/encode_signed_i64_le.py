"""_encode_signed_i64_le: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any, Callable, Protocol



def _encode_signed_i64_le(value: int) -> bytes:
    return int(value).to_bytes(8, "little", signed=True)
