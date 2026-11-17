"""list_pending_intent_work_key: isolated helper; captured dependencies are explicit arguments."""
from __future__ import annotations
from fastapi import Depends
from fastapi import Query
from core.schemas.intent_work_item import IntentWorkItem
from core.schemas.mempool_intent import MempoolIntent
from typing import Any, Protocol
class Dependencies(Protocol):
    hget_all_json: Any
    k_intents: Any

def list_pending_intent_work_key(intent):
    return intent.postedAt
