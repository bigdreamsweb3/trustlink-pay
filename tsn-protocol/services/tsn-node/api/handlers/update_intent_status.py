"""update_intent_status: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Path as ApiPath
import json
from core.schemas.mempool_intent import MempoolIntent
from core.schemas.update_status_request import UpdateStatusRequest
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    get_mempool_store: Callable[..., Any]
    k_intents: Callable[..., Any]


async def update_intent_status(node: Dependencies,
    intent_id: str = ApiPath(...),
    body: UpdateStatusRequest = ...,
) -> MempoolIntent:
    r = await node.get_mempool_store()
    raw = await r.hget(node.k_intents(), intent_id)
    if not raw:
        raise HTTPException(404, f"Intent {intent_id} not found")
    data = json.loads(raw)
    data.update({"status": body.status, "updatedAt": datetime.now(timezone.utc).isoformat()})
    if body.assignedCrankerPubkey is not None:
        data["assignedCrankerPubkey"] = body.assignedCrankerPubkey
    if body.fundingTxSig is not None:
        data["fundingTxSig"] = body.fundingTxSig
    if body.settlementTxSig is not None:
        data["settlementTxSig"] = body.settlementTxSig
    if body.settlementResolution is not None:
        data["settlementResolution"] = body.settlementResolution
    if body.settlementReason is not None:
        data["settlementReason"] = body.settlementReason
    await r.hset(node.k_intents(), intent_id, json.dumps(data))
    return MempoolIntent(**data)
