"""Idempotent claim using an atomic insert and immutable exact-value comparison.

The store's consume_once retains its one-winner contract. A failed insert may
only recover the identical binding; different work can never acquire the nonce.
"""
from __future__ import annotations


async def claim_once(self, key: str, field: str, value: str) -> bool:
    if not value:
        raise ValueError("Nonce claim binding is missing")
    if await self.consume_once(key, field, value):
        return True
    return await self.hget(key, field) == value
