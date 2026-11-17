from __future__ import annotations

from typing import Optional

async def hset(
    self,
    key: str,
    field: Optional[str] = None,
    value: Optional[str] = None,
    mapping: Optional[dict] = None,
) -> None:
    await self._call("hset", key=key, field=field, value=value, mapping=mapping)
