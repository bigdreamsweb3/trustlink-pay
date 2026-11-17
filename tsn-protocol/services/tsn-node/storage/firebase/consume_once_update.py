"""consume_once_update: isolated helper; captured dependencies are explicit arguments."""
from __future__ import annotations
import asyncio

def consume_once_update(self, key, field, value, transaction):
    reference = self._item_doc(key, field)
    snapshot = reference.get(transaction=transaction)
    if snapshot.exists:
        return False
    transaction.set(reference, {'value': value})
    return True
