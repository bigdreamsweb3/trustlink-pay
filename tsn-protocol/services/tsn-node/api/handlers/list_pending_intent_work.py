"""list_pending_intent_work: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from functools import partial
from .list_pending_intent_work_key import list_pending_intent_work_key
from fastapi import Depends
from fastapi import Query
from core.schemas.intent_work_item import IntentWorkItem
from core.schemas.mempool_intent import MempoolIntent
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    hget_all_json: Callable[..., Any]
    k_intents: Callable[..., Any]


async def list_pending_intent_work(node: Dependencies,
    limit: int = Query(50, ge=1, le=500)
) -> list[IntentWorkItem]:
    """Pending payment-intent submissions for crankers to create on chain."""
    intents = sorted(
        [
            MempoolIntent(**intent)
            for intent in await node.hget_all_json(node.k_intents())
            if intent.get("status") == "pending"
        ],
        key=list_pending_intent_work_key,
    )[:limit]
    return [IntentWorkItem(intent=intent) for intent in intents]
