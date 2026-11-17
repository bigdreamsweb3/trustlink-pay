from __future__ import annotations

from typing import Any
from app import config
import httpx

async def get_program_accounts(account_size: int) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            config.TSN_SOLANA_RPC_URL,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getProgramAccounts",
                "params": [
                    config.TSN_PROGRAM_ID,
                    {"encoding": "base64", "filters": [{"dataSize": account_size}]},
                ],
            },
        )
    response.raise_for_status()
    return response.json().get("result") or []
