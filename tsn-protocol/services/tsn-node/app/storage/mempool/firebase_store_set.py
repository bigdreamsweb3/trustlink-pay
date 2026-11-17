from __future__ import annotations

import asyncio

async def set(self, key: str, value: str) -> None:
    await asyncio.to_thread(self._write_document, key, value)
