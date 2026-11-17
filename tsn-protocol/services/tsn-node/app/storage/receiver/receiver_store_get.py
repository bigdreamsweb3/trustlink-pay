from __future__ import annotations

from typing import Optional

async def get(self, key: str) -> Optional[str]:
    return (await self._call("get", key=key)).get("value")
