"""mempool_status: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from core.schemas.mempool_status_request import MempoolStatusRequest
from core.schemas.mempool_status_response import MempoolStatusResponse
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    build_epoch_status: Callable[..., Any]


async def mempool_status(node: Dependencies, request: MempoolStatusRequest) -> MempoolStatusResponse:
    """Mempool health check and current epoch info."""
    return MempoolStatusResponse(
        status="ok",
        epoch=await node.build_epoch_status(),
    )
