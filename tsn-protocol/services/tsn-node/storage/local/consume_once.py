from __future__ import annotations

async def consume_once(self, key: str, field: str, value: str) -> bool:
    async with self._lock:
        data = await self._read()
        bucket = data.setdefault("hashes", {}).setdefault(key, {})
        if field in bucket:
            return False
        bucket[field] = value
        await self._write(data)
        return True
