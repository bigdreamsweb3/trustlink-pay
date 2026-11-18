"""Claim a deterministic authorization binding in Receiver's durable transaction."""
from __future__ import annotations


async def claim_once(self, key: str, field: str, value: str) -> bool:
    return bool((await self._call("claim_once", key=key, field=field, value=value)).get("claimed"))
