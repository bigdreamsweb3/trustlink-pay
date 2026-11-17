from __future__ import annotations

from app import config

def k_canonical_message_nonces() -> str: return f"{config.MEMPOOL_NS}:canonical_message_nonces"
