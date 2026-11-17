from __future__ import annotations

from app import config

def k_crankers() -> str: return f"{config.MEMPOOL_NS}:crankers"
