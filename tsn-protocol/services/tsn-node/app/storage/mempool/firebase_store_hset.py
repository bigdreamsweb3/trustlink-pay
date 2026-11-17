from __future__ import annotations

from typing import Optional
import asyncio

async def hset(self, key: str, field: Optional[str] = None, value: Optional[str] = None, mapping: Optional[dict] = None) -> None:
    if mapping:
        await asyncio.to_thread(self._write_mapping, key, mapping)
        return
    if field is None or value is None:
        raise ValueError("hset requires either field/value or mapping")
    await asyncio.to_thread(self._write_item, key, field, value)
