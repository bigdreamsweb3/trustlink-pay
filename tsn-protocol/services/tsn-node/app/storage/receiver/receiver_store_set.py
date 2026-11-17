from __future__ import annotations



async def set(self, key: str, value: str) -> None:
    await self._call("set", key=key, value=value)
