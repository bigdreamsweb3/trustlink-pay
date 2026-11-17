from __future__ import annotations

from app import config

def k_platform_read_keys() -> str: return f"{config.MEMPOOL_NS}:platform_read_keys"
