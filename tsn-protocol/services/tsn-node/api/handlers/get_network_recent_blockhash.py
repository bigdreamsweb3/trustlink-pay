"""get_network_recent_blockhash: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
from typing import Any
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    solana_rpc: Callable[..., Any]


async def get_network_recent_blockhash(node: Dependencies) -> dict[str, Any]:
    """Return a sender-signable blockhash from the RPC this Node uses for verification."""
    response = await node.solana_rpc("getLatestBlockhash", [{"commitment": "confirmed"}])
    result = response.get("result") or {}
    value = result.get("value") or {}
    blockhash = str(value.get("blockhash") or "")
    last_valid_block_height = value.get("lastValidBlockHeight")
    if not blockhash or not isinstance(last_valid_block_height, int):
        raise HTTPException(503, "Solana RPC returned an invalid recent blockhash")
    return {
        "recentBlockhash": blockhash,
        "lastValidBlockHeight": last_valid_block_height,
        "contextSlot": (result.get("context") or {}).get("slot"),
    }
