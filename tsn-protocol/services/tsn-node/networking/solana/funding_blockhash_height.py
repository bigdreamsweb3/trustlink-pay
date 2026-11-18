"""Validate the confirmed height used for an unsigned-funding issuance margin."""
from __future__ import annotations
from typing import Any
from .funding_blockhash_issuance import MAX_SAFE_RPC_INTEGER


def funding_blockhash_height(response: Any) -> int:
    """Return a safe nonnegative height; this read is not proof of nonexecution."""
    height = response.get("result") if isinstance(response, dict) and not response.get("error") else None
    if type(height) is not int or not 0 <= height <= MAX_SAFE_RPC_INTEGER:
        raise ValueError("Invalid funding blockhash height")
    return height
