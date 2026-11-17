from __future__ import annotations

from typing import Any

async def submit_tin_exit_proof(self, payload: dict[str, Any]) -> str:
    import httpx

    headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(self.endpoint, json=payload, headers=headers)
        response.raise_for_status()
        body = response.json()
    tx_hash = str(body.get("creditcoinTxHash") or body.get("txHash") or "")
    if not tx_hash:
        raise RuntimeError("EVM cranker response did not include a Creditcoin transaction hash")
    return tx_hash
