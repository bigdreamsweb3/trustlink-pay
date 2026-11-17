"""_decode_base64_signature: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
import base64
import binascii
from typing import Any, Callable, Protocol



def _decode_base64_signature(value: str) -> bytes:
    try:
        signature = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(403, "signature is not valid base64") from exc
    if len(signature) != 64:
        raise HTTPException(403, "signature must be 64 bytes")
    return signature
