"""close_epoch_task: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
import json
from core.schemas.epoch_close_result import EpochCloseResult
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TERMINAL_INTENT_STATUSES: Any
    commit_epoch_to_github: Callable[..., Any]
    get_mempool_store: Callable[..., Any]
    hget_all_json: Callable[..., Any]
    k_epoch: Callable[..., Any]
    k_intents: Callable[..., Any]
    read_epoch_state: Callable[..., Any]


async def close_epoch_task(node: Dependencies) -> EpochCloseResult:
    r = await node.get_mempool_store()
    intents = await node.hget_all_json(node.k_intents())
    state = await node.read_epoch_state(); epoch_number = int(state["epoch_number"]); closed_at = datetime.now(timezone.utc).isoformat()
    commit_url = await node.commit_epoch_to_github(epoch_number, intents, closed_at)
    rollover_intents = [i for i in intents if str(i.get("status")) not in node.TERMINAL_INTENT_STATUSES]
    await r.delete(node.k_intents())
    if rollover_intents: await r.hset(node.k_intents(), mapping={i["id"]: json.dumps(i) for i in rollover_intents})
    new_epoch = epoch_number + 1; await r.set(node.k_epoch(), json.dumps({"epoch_number": new_epoch, "started_at": closed_at}))
    settled_count = sum(1 for item in intents if item.get("status") in {"executed", "settled"})
    return EpochCloseResult(epoch_number=epoch_number, intents_archived=len(intents), settlements_archived=settled_count, intents_rolled_over=len(rollover_intents), intents_pruned=len(intents)-len(rollover_intents), settlements_pruned=settled_count, github_commit_url=commit_url, new_epoch_number=new_epoch, message=f"Epoch {epoch_number} archived; epoch {new_epoch} started.")
