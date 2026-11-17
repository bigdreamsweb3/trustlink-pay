"""get_token_account_balance_ui: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
import httpx
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_SOLANA_RPC_URL: Any


async def get_token_account_balance_ui(node: Dependencies, token_account: str) -> tuple[float, int]:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTokenAccountBalance",
        "params": [token_account],
    }
    async with httpx.AsyncClient(timeout=12) as client:
        response = await client.post(node.TSN_SOLANA_RPC_URL, json=payload)
    response.raise_for_status()
    value = response.json().get("result", {}).get("value", {})
    return float(value.get("uiAmountString") or value.get("uiAmount") or 0), int(value.get("decimals") or 0)
