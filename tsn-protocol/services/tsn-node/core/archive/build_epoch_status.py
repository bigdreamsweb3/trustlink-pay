"""build_epoch_status: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from core.schemas.epoch_status import EpochStatus
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    get_mempool_store: Callable[..., Any]
    hget_all_json: Callable[..., Any]
    k_intents: Callable[..., Any]
    next_close_for_state: Callable[..., Any]
    read_epoch_state: Callable[..., Any]


async def build_epoch_status(node: Dependencies) -> EpochStatus:
    r = await node.get_mempool_store()
    state        = await node.read_epoch_state()
    intent_count = await r.hlen(node.k_intents())
    settlement_count = sum(1 for intent in await node.hget_all_json(node.k_intents()) if intent.get("status") in {"executed", "settled"})
    next_close   = node.next_close_for_state(state)
    return EpochStatus(
        epoch_number    = state["epoch_number"],
        epoch_started_at= state["started_at"],
        next_close_at   = next_close.isoformat(),
        intent_count    = int(intent_count),
        settlement_count = settlement_count,
    )
