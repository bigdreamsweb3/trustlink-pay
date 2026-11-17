"""_native_blockhash_lifetime: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from fastapi import HTTPException
from typing import Any
from typing import Any, Callable, Protocol



def _native_blockhash_lifetime(response: Any, minimum_slot: int = 0) -> tuple[str, bytes, int, int]:
    result = response.get("result") if isinstance(response, dict) else None
    value = result.get("value") if isinstance(result, dict) else None
    context = result.get("context") if isinstance(result, dict) else None
    blockhash = value.get("blockhash") if isinstance(value, dict) else None
    height = value.get("lastValidBlockHeight") if isinstance(value, dict) else None
    slot = context.get("slot") if isinstance(context, dict) else None
    if (not isinstance(blockhash, str) or not 32 <= len(blockhash) <= 44
            or type(height) is not int or not 0 < height <= 0xFFFFFFFFFFFFFFFF
            or type(slot) is not int or not 0 < slot <= 0xFFFFFFFFFFFFFFFF or slot < minimum_slot):
        raise HTTPException(409, "TCAP_TRANSACTION_BLOCKHASH_LIFETIME_INVALID")
    try:
        decoded = bytes(Pubkey.from_string(blockhash))
    except ValueError as exc:
        raise HTTPException(409, "TCAP_TRANSACTION_BLOCKHASH_LIFETIME_INVALID") from exc
    if not any(decoded) or str(Pubkey(decoded)) != blockhash:
        raise HTTPException(409, "TCAP_TRANSACTION_BLOCKHASH_LIFETIME_INVALID")
    return blockhash, decoded, height, slot
