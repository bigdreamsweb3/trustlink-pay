from __future__ import annotations
from functools import partial
from .consume_once_consume import consume_once_consume
from functools import partial
from .consume_once_update import consume_once_update
import asyncio

async def consume_once(self, key: str, field: str, value: str) -> bool:
    consume = partial(consume_once_consume, self, key, field, value)

    return await asyncio.to_thread(consume)
