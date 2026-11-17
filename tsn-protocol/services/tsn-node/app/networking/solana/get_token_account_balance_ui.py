from __future__ import annotations

from app import config
import httpx

async def get_token_account_balance_ui(token_account: str) -> tuple[float, int]:
    payload = {"jsonrpc": "2.0", "id": 1, "method": "getTokenAccountBalance", "params": [token_account]}
    async with httpx.AsyncClient(timeout=12) as client:
        response = await client.post(config.TSN_SOLANA_RPC_URL, json=payload)
    response.raise_for_status()
    value = response.json().get("result", {}).get("value", {})
    return float(value.get("uiAmountString") or value.get("uiAmount") or 0), int(value.get("decimals") or 0)
