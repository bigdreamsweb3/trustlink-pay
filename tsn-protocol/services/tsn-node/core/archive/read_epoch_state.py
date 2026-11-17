"""read_epoch_state: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
import json
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    get_mempool_store: Callable[..., Any]
    k_epoch: Callable[..., Any]


async def read_epoch_state(node: Dependencies) -> dict:
    r = await node.get_mempool_store()
    raw = await r.get(node.k_epoch())
    if raw:
        return json.loads(raw)
    now_iso = datetime.now(timezone.utc).isoformat()
    state = {"epoch_number": 1, "started_at": now_iso}
    await r.set(node.k_epoch(), json.dumps(state))
    return state
