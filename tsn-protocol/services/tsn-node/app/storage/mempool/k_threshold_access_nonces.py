from __future__ import annotations

from app import config

def k_threshold_access_nonces() -> str: return f"{config.MEMPOOL_NS}:threshold_access_nonces"
