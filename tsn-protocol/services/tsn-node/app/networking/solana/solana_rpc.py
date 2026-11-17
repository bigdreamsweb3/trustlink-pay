from __future__ import annotations

from typing import Any
from fastapi import HTTPException
from app import config
import httpx

async def solana_rpc(method: str, params: list[Any], timeout: float = 12) -> dict[str, Any]:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(config.TSN_SOLANA_RPC_URL, json=payload)
        response.raise_for_status()
        rpc_response = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        config.logger.warning("Solana RPC unavailable for %s: %s", method, exc)
        raise HTTPException(503, "Solana RPC is unavailable while verifying TINS state") from exc
    if rpc_response.get("error"):
        message = rpc_response["error"].get("message", "unknown error")
        config.logger.warning("Solana RPC error for %s: %s", method, rpc_response["error"])
        raise HTTPException(503, f"Solana RPC rejected TINS lookup: {message}")
    return rpc_response
