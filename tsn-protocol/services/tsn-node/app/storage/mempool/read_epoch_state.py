from __future__ import annotations

from datetime import datetime
from .get_mempool_store import get_mempool_store
import json
from .k_epoch import k_epoch
from datetime import timezone

async def read_epoch_state() -> dict:
    store = await get_mempool_store()
    raw = await store.get(k_epoch())
    if raw:
        return json.loads(raw)
    now_iso = datetime.now(timezone.utc).isoformat()
    state = {"epoch_number": 1, "started_at": now_iso}
    await store.set(k_epoch(), json.dumps(state))
    return state
