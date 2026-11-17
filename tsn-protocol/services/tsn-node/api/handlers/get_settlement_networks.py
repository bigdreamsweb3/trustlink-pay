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
    """Return only destination routes ready for Creditcoin settlement.

    A chain ID or static configuration alone never makes a network active. The
    endpoint performs the same live route and liquidity checks used at intent
    admission; the exact requested amount is checked again for each intent.
    """
    try:
        return await node.ready_destination_networks(int(datetime.now(timezone.utc).timestamp()))
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(503, f"settlement network registry is invalid: {exc}") from exc
