"""hgetall_read_items: isolated helper; captured dependencies are explicit arguments."""
from __future__ import annotations
import asyncio

def hgetall_read_items(self, key) -> dict:
    return {doc.id: (doc.to_dict() or {}).get('value') for doc in self._doc(key).collection('items').stream()}
