"""post_cranker_heartbeat: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from fastapi import Depends
import json
from core.schemas.cranker_heartbeat_record import CrankerHeartbeatRecord
from core.schemas.cranker_heartbeat_request import CrankerHeartbeatRequest
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    get_mempool_store: Callable[..., Any]
    k_crankers: Callable[..., Any]


async def post_cranker_heartbeat(node: Dependencies, req: CrankerHeartbeatRequest) -> CrankerHeartbeatRecord:
    r = await node.get_mempool_store()
    now_iso = datetime.now(timezone.utc).isoformat()
    existing_raw = await r.hget(node.k_crankers(), req.operator_pubkey)
    first_seen = now_iso
    if existing_raw:
        try:
            first_seen = json.loads(existing_raw).get("first_seen_at") or now_iso
        except json.JSONDecodeError:
            pass
    record = CrankerHeartbeatRecord(
        **req.model_dump(),
        first_seen_at=first_seen,
        last_seen_at=now_iso,
        online=True,
    )
    await r.hset(node.k_crankers(), req.operator_pubkey, json.dumps(record.model_dump()))
    return record
