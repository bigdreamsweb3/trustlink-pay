from __future__ import annotations
from typing import Optional

async def hset(self, key: str, field: Optional[str] = None, value: Optional[str] = None, mapping: Optional[dict] = None) -> None:
    async with self._lock:
        data = await self._read()
        bucket = data.setdefault("hashes", {}).setdefault(key, {})
        if mapping:
            bucket.update(mapping)
        elif field is not None and value is not None:
            bucket[field] = value
        else:
            raise ValueError("hset requires either field/value or mapping")
        await self._write(data)
