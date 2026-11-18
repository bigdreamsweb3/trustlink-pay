"""Read a bank's confirmed height with the funding issuer's minimum slot.

This read is a bounded routing/retry diagnostic. Neither a reported deadline
nor this height proves that an owner-signed transaction never executed.
"""
from __future__ import annotations
import httpx


async def _funding_blockhash_bank_height(client: httpx.AsyncClient, rpc_url: str, context_slot: int) -> int:
    response = await client.post(rpc_url, json={
        "jsonrpc": "2.0", "id": "funding-blockhash-height", "method": "getBlockHeight",
        "params": [{"commitment": "confirmed", "minContextSlot": context_slot}],
    })
    response.raise_for_status()
    body = response.json()
    height = body.get("result") if isinstance(body, dict) and not body.get("error") else None
    if type(height) is not int or not 0 <= height <= 9007199254740991:
        raise ValueError("Funding RPC bank height is unavailable")
    return height
