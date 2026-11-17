from __future__ import annotations



async def consume_once(self, key: str, field: str, value: str) -> bool:
    return bool((await self._call(
        "consume_once", key=key, field=field, value=value
    )).get("consumed"))
