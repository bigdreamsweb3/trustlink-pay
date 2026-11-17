"""get_call: isolated helper; captured dependencies are explicit arguments."""
from __future__ import annotations
from typing import Optional
import asyncio

def get_call(self, key):
    return self._doc(key).get()
