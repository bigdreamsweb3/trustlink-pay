from __future__ import annotations

async def set(self, key: str, value: str) -> None:
    async with self._lock:
        data = await self._read()
        data.setdefault("values", {})[key] = value
        await self._write(data)
