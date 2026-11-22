"""Expose no external routes while cross-network settlement is disabled."""
from __future__ import annotations
from typing import Any

async def ready_destination_networks(now_seconds: int) -> list[dict[str, Any]]:
    """Return no enabled destinations; old environment configuration has no authority."""
    return []
