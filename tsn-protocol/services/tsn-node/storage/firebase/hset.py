from __future__ import annotations
from functools import partial
from .hset_write_mapping import hset_write_mapping
from functools import partial
from .hset_call import hset_call
from typing import Optional
import asyncio

async def hset(self, key: str, field: Optional[str] = None, value: Optional[str] = None, mapping: Optional[dict] = None) -> None:
    if mapping:
        write_mapping = partial(hset_write_mapping, self, mapping, key)
        await asyncio.to_thread(write_mapping)
        return

    if field is None or value is None:
        raise ValueError("hset requires either field/value or mapping")
    await asyncio.to_thread(partial(hset_call, self, key, field, value))
