from __future__ import annotations

async def delete(self, *keys: str) -> None:
    async with self._lock:
        data = await self._read()
        for key in keys:
            data.get("values", {}).pop(key, None)
            data.get("hashes", {}).pop(key, None)
        await self._write(data)
