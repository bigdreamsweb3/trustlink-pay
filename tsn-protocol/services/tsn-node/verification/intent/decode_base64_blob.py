"""_decode_base64_blob: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
from typing import Any
import base64
import binascii
from typing import Any, Callable, Protocol



def _decode_base64_blob(value: Any, label: str) -> bytes:
    try:
        decoded = base64.b64decode(str(value or ""), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(422, f"{label} must be base64") from exc
    if not decoded:
        raise HTTPException(422, f"{label} must not be empty")
    return decoded
