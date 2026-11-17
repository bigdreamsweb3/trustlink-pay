from __future__ import annotations

from typing import Optional

async def hget(self, key: str, field: str) -> Optional[str]:
    return (await self._call("hget", key=key, field=field)).get("value")
