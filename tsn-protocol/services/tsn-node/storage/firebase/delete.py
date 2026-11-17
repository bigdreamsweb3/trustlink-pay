from __future__ import annotations
from functools import partial
from .delete_delete_keys import delete_delete_keys
import asyncio

async def delete(self, *keys: str) -> None:
    delete_keys = partial(delete_delete_keys, keys, self)
    await asyncio.to_thread(delete_keys)
