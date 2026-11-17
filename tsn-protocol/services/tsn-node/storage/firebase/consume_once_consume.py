"""consume_once_consume: isolated helper; captured dependencies are explicit arguments."""
from __future__ import annotations
from functools import partial
from .consume_once_update import consume_once_update
import asyncio

def consume_once_consume(self, key, field, value) -> bool:
    transaction = self.db.transaction()
    update = self.firestore.transactional(partial(consume_once_update, self, key, field, value))
    return bool(update(transaction))
