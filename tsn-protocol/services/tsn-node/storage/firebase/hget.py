from __future__ import annotations
from functools import partial
from .hget_call import hget_call
from typing import Optional
import asyncio

async def hget(self, key: str, field: str) -> Optional[str]:
    doc = await asyncio.to_thread(partial(hget_call, self, key, field))
    if not doc.exists:
        return None
    return (doc.to_dict() or {}).get("value")
