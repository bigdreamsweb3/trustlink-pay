from __future__ import annotations

import asyncio

async def consume_once(self, key: str, field: str, value: str) -> bool:
    return await asyncio.to_thread(self._consume, key, field, value)
