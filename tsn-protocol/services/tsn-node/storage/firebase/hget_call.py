"""hget_call: isolated helper; captured dependencies are explicit arguments."""
from __future__ import annotations
from typing import Optional
import asyncio

def hget_call(self, key, field):
    return self._item_doc(key, field).get()
