from __future__ import annotations

from typing import Any
import asyncio

async def hgetall(self, key: str) -> dict[str, Any]:
    return await asyncio.to_thread(self._read_items, key)
