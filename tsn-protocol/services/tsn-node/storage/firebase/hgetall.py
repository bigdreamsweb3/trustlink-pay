from __future__ import annotations
from functools import partial
from .hgetall_read_items import hgetall_read_items
import asyncio

async def hgetall(self, key: str) -> dict:
    read_items = partial(hgetall_read_items, self, key)
    return await asyncio.to_thread(read_items)
