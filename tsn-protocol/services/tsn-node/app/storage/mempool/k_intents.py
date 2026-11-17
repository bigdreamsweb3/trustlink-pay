from __future__ import annotations

from app import config

def k_intents() -> str: return f"{config.MEMPOOL_NS}:intents"
