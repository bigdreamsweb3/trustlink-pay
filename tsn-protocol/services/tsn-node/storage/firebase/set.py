from __future__ import annotations
from functools import partial
from .set_call import set_call
import asyncio

async def set(self, key: str, value: str) -> None:
    await asyncio.to_thread(partial(set_call, self, key, value))
