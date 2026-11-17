from __future__ import annotations

import asyncio

async def delete(self, *keys: str) -> None:
    await asyncio.to_thread(self._delete_keys, keys)
