from __future__ import annotations



async def delete(self, *keys: str) -> None:
    await self._call("delete", key=keys[0] if keys else "unused", keys=list(keys))
