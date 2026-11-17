from __future__ import annotations

from typing import Any
from .get_store import get_store

async def get_mempool_store() -> Any:
    return await get_store()
