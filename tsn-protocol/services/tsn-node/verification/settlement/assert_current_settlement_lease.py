"""_assert_current_settlement_lease: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from fastapi import HTTPException
from typing import Any
from typing import Any, Callable, Protocol



def _assert_current_settlement_lease(work: dict[str, Any], operator: str) -> None:
    lease = work.get("crankerLease") or {}
    if work.get("kind") not in ("SETTLEMENT","TCAP_EPOCH_ACCOUNTING") or work.get("status") != "CRANKER_LEASED" or lease.get("owner") != operator:
        raise HTTPException(403, "Settlement is not leased to this Cranker")
    try:
        expires = datetime.fromisoformat(str(lease.get("expiresAt") or "").replace("Z", "+00:00"))
        if expires <= datetime.now(timezone.utc):
            raise ValueError("expired")
    except (ValueError, TypeError) as exc:
        raise HTTPException(403, "Settlement Cranker lease is expired or invalid") from exc
