"""set_call: isolated helper; captured dependencies are explicit arguments."""
from __future__ import annotations
import asyncio

def set_call(self, key, value):
    return self._doc(key).set({'value': value})
