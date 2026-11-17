from __future__ import annotations

from typing import Any
import asyncio

def __init__(self) -> None:
    self.records: dict[str, dict[str, Any]] = {}
    self._lock = asyncio.Lock()
