from __future__ import annotations

async def hgetall(self, key: str) -> dict:
    async with self._lock:
        data = await self._read()
        return dict(data.get("hashes", {}).get(key, {}))
