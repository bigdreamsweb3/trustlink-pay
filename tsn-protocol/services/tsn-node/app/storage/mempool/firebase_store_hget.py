from __future__ import annotations

from typing import Optional
import asyncio

async def hget(self, key: str, field: str) -> Optional[str]:
    doc = await asyncio.to_thread(self._read_item, key, field)
    if not doc.exists:
        return None
    return (doc.to_dict() or {}).get("value")
