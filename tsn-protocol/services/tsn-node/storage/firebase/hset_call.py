"""hset_call: isolated helper; captured dependencies are explicit arguments."""
from __future__ import annotations
from typing import Optional
import asyncio

def hset_call(self, key, field, value):
    return self._item_doc(key, field).set({'value': value})
