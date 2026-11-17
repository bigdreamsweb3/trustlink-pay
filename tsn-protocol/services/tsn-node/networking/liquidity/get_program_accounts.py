"""get_program_accounts: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
import httpx
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_PROGRAM_ID: Any
    TSN_SOLANA_RPC_URL: Any


async def get_program_accounts(node: Dependencies, account_size: int) -> list[dict[str, Any]]:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getProgramAccounts",
        "params": [
            node.TSN_PROGRAM_ID,
            {
                "encoding": "base64",
                "filters": [{"dataSize": account_size}],
            },
        ],
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(node.TSN_SOLANA_RPC_URL, json=payload)
    response.raise_for_status()
    return response.json().get("result") or []
