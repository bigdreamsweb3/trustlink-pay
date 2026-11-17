from __future__ import annotations

from app import config

def k_epoch() -> str: return f"{config.MEMPOOL_NS}:epoch"
