from __future__ import annotations

from .get_mempool_store import get_mempool_store
import json

async def hget_all_json(key: str) -> list:
    raw: dict = await (await get_mempool_store()).hgetall(key)
    return [json.loads(v) for v in raw.values()]
