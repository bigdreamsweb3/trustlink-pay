from __future__ import annotations

import httpx

async def _eth_call(client: httpx.AsyncClient, rpc_url: str, to: str, data: str) -> str:
    response = await client.post(
        rpc_url,
        json={"jsonrpc": "2.0", "id": 1, "method": "eth_call", "params": [{"to": to, "data": data}, "latest"]},
    )
    response.raise_for_status()
    body = response.json()
    if body.get("error") or not isinstance(body.get("result"), str):
        raise RuntimeError(f"Creditcoin registry eth_call failed: {body.get('error') or 'missing result'}")
    return body["result"]
