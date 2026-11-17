from __future__ import annotations

import asyncio
from app import config

def __init__(self, path=config.MEMPOOL_FILE):
    self.path = path
    self._lock = asyncio.Lock()
