"""Validate an exact unsigned-funding issuer tuple without inventing metadata."""
from __future__ import annotations
import hashlib
from typing import Any
from app.solana_pubkey import Pubkey
from core.schemas.sender_funding_blockhash_context import SenderFundingBlockhashContext


def funding_blockhash_candidate(response: Any, minimum_slot: int) -> tuple[SenderFundingBlockhashContext, str]:
    """Return strict RPC context and a decoded-byte fingerprint, or raise ValueError."""
    result = response.get("result") if isinstance(response, dict) and not response.get("error") else None
    value = result.get("value") if isinstance(result, dict) else None
    rpc_context = result.get("context") if isinstance(result, dict) else None
    if not isinstance(value, dict) or not isinstance(rpc_context, dict):
        raise ValueError("Invalid funding blockhash issuer envelope")
    context = SenderFundingBlockhashContext(blockhash=value.get("blockhash"),
        lastValidBlockHeight=value.get("lastValidBlockHeight"), contextSlot=rpc_context.get("slot"))
    decoded = bytes(Pubkey.from_string(context.blockhash))
    if not any(decoded) or str(Pubkey(decoded)) != context.blockhash or context.contextSlot < minimum_slot:
        raise ValueError("Invalid funding blockhash issuer context")
    return context, hashlib.sha256(decoded).hexdigest()[:16]
