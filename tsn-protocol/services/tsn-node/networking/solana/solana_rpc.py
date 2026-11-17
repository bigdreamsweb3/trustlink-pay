"""solana_rpc: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
from typing import Any
import httpx
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_SOLANA_RPC_URLS: Any
    logger: Any


async def solana_rpc(node: Dependencies, method: str, params: list[Any], timeout: float = 12) -> dict[str, Any]:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    }
    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=timeout) as client:
        for rpc_url in node.TSN_SOLANA_RPC_URLS:
            try:
                response = await client.post(rpc_url, json=payload)
                response.raise_for_status()
                rpc_response = response.json()
                if rpc_response.get("error"):
                    last_error = RuntimeError(str(rpc_response["error"]))
                    continue
                return rpc_response
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
                node.logger.warning("Solana RPC unavailable for %s at %s: %s", method, rpc_url, exc)
    raise HTTPException(503, "Solana RPC is unavailable while verifying TINS state") from last_error
