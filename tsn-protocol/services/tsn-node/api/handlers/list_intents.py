"""list_intents: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from functools import partial
from .list_intents_key import list_intents_key
from fastapi import Depends
from fastapi import Query
from typing import Optional
from core.schemas.mempool_intent import MempoolIntent
from core.schemas.public_mempool_intent import PublicMempoolIntent
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    hget_all_json: Callable[..., Any]
    k_intents: Callable[..., Any]
    public_intent: Callable[..., Any]


async def list_intents(node: Dependencies, status: Optional[str] = Query(None)) -> list[PublicMempoolIntent]:
    items = [MempoolIntent(**i) for i in await node.hget_all_json(node.k_intents())]
    if status:
        items = [i for i in items if i.status == status]
    return [node.public_intent(item) for item in sorted(items, key=list_intents_key)]
