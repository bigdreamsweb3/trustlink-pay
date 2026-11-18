"""get_network_recent_blockhash: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
from typing import Any
from typing import Any, Callable, Protocol
from core.schemas.sender_funding_blockhash_context import SenderFundingBlockhashContext
from app.solana_pubkey import Pubkey

class Dependencies(Protocol):
    solana_rpc: Callable[..., Any]


async def get_network_recent_blockhash(node: Dependencies) -> dict[str, Any]:
    """Return a sender-signable blockhash from the RPC this Node uses for verification."""
    response = await node.solana_rpc("getLatestBlockhash", [{"commitment": "confirmed"}])
    if not isinstance(response, dict) or response.get("error"):
        raise HTTPException(503, "Solana RPC returned an invalid recent blockhash")
    result = response.get("result") if isinstance(response, dict) else None
    value = result.get("value") if isinstance(result, dict) else None
    rpc_context = result.get("context") if isinstance(result, dict) else None
    if not isinstance(value, dict) or not isinstance(rpc_context, dict):
        raise HTTPException(503, "Solana RPC returned an invalid recent blockhash")
    blockhash = value.get("blockhash")
    last_valid_block_height = value.get("lastValidBlockHeight")
    context_slot = rpc_context.get("slot")
    try:
        context = SenderFundingBlockhashContext(blockhash=blockhash, lastValidBlockHeight=last_valid_block_height, contextSlot=context_slot)
        decoded = bytes(Pubkey.from_string(context.blockhash))
        if not any(decoded) or str(Pubkey(decoded)) != blockhash:
            raise ValueError("Invalid blockhash")
    except ValueError as exc:
        raise HTTPException(503, "Solana RPC returned an invalid recent blockhash") from exc
    return {
        "recentBlockhash": blockhash,
        "lastValidBlockHeight": last_valid_block_height,
        "contextSlot": context.contextSlot,
    }
