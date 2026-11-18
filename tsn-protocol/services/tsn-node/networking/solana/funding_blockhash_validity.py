"""Validate confirmed blockhash visibility at or above the issuance context."""
from __future__ import annotations
from typing import Any
from .funding_blockhash_issuance import MAX_SAFE_RPC_INTEGER


def funding_blockhash_validity(response: Any, minimum_slot: int) -> tuple[bool, int]:
    """Return the exact boolean and safe bank slot; unknown/malformed reads raise ValueError."""
    result = response.get("result") if isinstance(response, dict) and not response.get("error") else None
    context = result.get("context") if isinstance(result, dict) else None
    slot = context.get("slot") if isinstance(context, dict) else None
    valid = result.get("value") if isinstance(result, dict) else None
    if type(valid) is not bool or type(slot) is not int or not minimum_slot <= slot <= MAX_SAFE_RPC_INTEGER:
        raise ValueError("Invalid funding blockhash validity context")
    return valid, slot
