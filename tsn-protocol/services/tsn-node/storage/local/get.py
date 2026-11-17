from __future__ import annotations
from typing import Optional

async def get(self, key: str) -> Optional[str]:
    async with self._lock:
        data = await self._read()
        return data.get("values", {}).get(key)
