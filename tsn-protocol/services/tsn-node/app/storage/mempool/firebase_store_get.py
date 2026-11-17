from __future__ import annotations

from typing import Optional
import asyncio

async def get(self, key: str) -> Optional[str]:
    doc = await asyncio.to_thread(self._read_document, key)
    if not doc.exists:
        return None
    return (doc.to_dict() or {}).get("value")
