from __future__ import annotations

from app import config

def k_tin_read_delegations() -> str: return f"{config.MEMPOOL_NS}:tin_read_delegations"
