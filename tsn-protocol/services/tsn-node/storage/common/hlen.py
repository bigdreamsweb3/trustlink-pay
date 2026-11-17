from __future__ import annotations

async def hlen(self, key: str) -> int:
    return len(await self.hgetall(key))
