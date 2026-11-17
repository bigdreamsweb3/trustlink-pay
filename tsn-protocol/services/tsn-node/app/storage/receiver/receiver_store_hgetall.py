from __future__ import annotations

from typing import Any

async def hgetall(self, key: str) -> dict[str, Any]:
    return dict((await self._call("hgetall", key=key)).get("values") or {})
