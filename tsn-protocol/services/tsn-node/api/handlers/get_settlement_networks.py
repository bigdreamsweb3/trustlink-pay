"""get_settlement_networks: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from fastapi import HTTPException
from typing import Any
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    ready_destination_networks: Any


async def get_settlement_networks(node: Dependencies) -> list[dict[str, Any]]:
    """Return admitted external routes; current implementation returns an empty list.

    Planned networks and stale environment entries cannot authorize settlement.
    """
    try:
        return await node.ready_destination_networks(int(datetime.now(timezone.utc).timestamp()))
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(503, f"settlement network registry is invalid: {exc}") from exc
