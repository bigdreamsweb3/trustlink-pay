from __future__ import annotations
from typing import Optional

async def hget(self, key: str, field: str) -> Optional[str]:
    async with self._lock:
        data = await self._read()
        return data.get("hashes", {}).get(key, {}).get(field)
