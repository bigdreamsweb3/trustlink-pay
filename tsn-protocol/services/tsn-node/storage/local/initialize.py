from __future__ import annotations
from pathlib import Path
import asyncio
from core.configuration import MEMPOOL_FILE

def __init__(self, path: Path = MEMPOOL_FILE):
    self.path = path
    self._lock = asyncio.Lock()
