"""hset_write_mapping: isolated helper; captured dependencies are explicit arguments."""
from __future__ import annotations
from functools import partial
from .hset_call import hset_call
from typing import Optional
import asyncio

def hset_write_mapping(self, mapping, key) -> None:
    batch = self.db.batch()
    for item_field, item_value in mapping.items():
        batch.set(self._item_doc(key, item_field), {'value': item_value})
    batch.commit()
