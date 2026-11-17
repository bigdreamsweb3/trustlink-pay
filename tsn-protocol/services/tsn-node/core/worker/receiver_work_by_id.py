"""_receiver_work_by_id: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
from typing import Any
import httpx
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_RECEIVER_NODE_API_KEY: Any
    TSN_RECEIVER_URL: Any
    receiver_request: Callable[..., Any]


async def _receiver_work_by_id(node: Dependencies, work_id: str) -> dict[str, Any]:
    if not node.TSN_RECEIVER_URL or not node.TSN_RECEIVER_NODE_API_KEY:
        raise HTTPException(503, "TSN Receiver service is not configured")
    async with httpx.AsyncClient(timeout=20) as client:
        response = await node.receiver_request(
            client,
            "GET",
            "/api/internal/node/work",
            params={"id": work_id},
            headers={"x-api-key": node.TSN_RECEIVER_NODE_API_KEY},
        )
    if response.status_code == 404:
        raise HTTPException(404, "Receiver work was not found")
    if response.status_code != 200:
        raise HTTPException(503, "TSN Receiver work lookup failed")
    work = response.json().get("work")
    if not isinstance(work, dict):
        raise HTTPException(422, "Receiver returned malformed work")
    return work
