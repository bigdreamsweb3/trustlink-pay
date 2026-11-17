"""_decode_owner_pubkey: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from fastapi import HTTPException
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    decode_base58: Callable[..., Any]


def _decode_owner_pubkey(node: Dependencies, value: str) -> bytes:
    try:
        owner_bytes = node.decode_base58(value)
    except ValueError as exc:
        raise HTTPException(422, "owner_pubkey is not valid base58") from exc
    if len(owner_bytes) != 32:
        raise HTTPException(422, "owner_pubkey must decode to 32 bytes")
    try:
        Pubkey.from_string(value)
    except ValueError as exc:
        raise HTTPException(422, "owner_pubkey is not a valid Solana pubkey") from exc
    return owner_bytes
