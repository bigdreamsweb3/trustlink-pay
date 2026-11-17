from __future__ import annotations
from functools import partial
from .get_call import get_call
from typing import Optional
import asyncio

async def get(self, key: str) -> Optional[str]:
    doc = await asyncio.to_thread(partial(get_call, self, key))
    if not doc.exists:
        return None
    return (doc.to_dict() or {}).get("value")
