"""list_intents_key: isolated helper; captured dependencies are explicit arguments."""
from __future__ import annotations
from fastapi import Depends
from fastapi import Query
from typing import Optional
from core.schemas.mempool_intent import MempoolIntent
from core.schemas.public_mempool_intent import PublicMempoolIntent
from typing import Any, Protocol
class Dependencies(Protocol):
    hget_all_json: Any
    k_intents: Any
    public_intent: Any

def list_intents_key(i):
    return i.postedAt
