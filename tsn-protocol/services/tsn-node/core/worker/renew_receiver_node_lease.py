"""_renew_receiver_node_lease: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from typing import Any
import asyncio
import httpx
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_NODE_ID: Any
    receiver_request: Callable[..., Any]


async def _renew_receiver_node_lease(node: Dependencies, client: httpx.AsyncClient, headers: dict[str, str], work: dict[str, Any]) -> None:
    lease = work.get("nodeLease") or {}
    response = await asyncio.wait_for(node.receiver_request(
        client, "PUT", "/api/internal/node/work", headers=headers, json={
            "id": work["id"], "owner": node.TSN_NODE_ID, "expectedVersion": work["stateVersion"],
            "leaseId": lease.get("leaseId") or work["id"],
            "leaseVersion": lease.get("version") or work["stateVersion"],
        },
    ), timeout=10)
    if response.status_code != 200:
        raise RuntimeError(f"TSN_RECEIVER_NODE_LEASE_LOST: renewal returned HTTP {response.status_code}")
    renewed = response.json()
    renewed_lease = renewed.get("nodeLease") or {}
    if (renewed.get("id") != work["id"] or renewed.get("stateVersion") != work["stateVersion"]
            or renewed_lease.get("owner") != node.TSN_NODE_ID
            or (renewed_lease.get("leaseId") or work["id"]) != (lease.get("leaseId") or work["id"])
            or (renewed_lease.get("version") or renewed.get("stateVersion")) != (lease.get("version") or work["stateVersion"])):
        raise RuntimeError("TSN_RECEIVER_NODE_LEASE_LOST: renewal changed the claim context")
    try:
        expires = datetime.fromisoformat(str(renewed_lease.get("expiresAt") or "").replace("Z", "+00:00"))
        if expires <= datetime.now(timezone.utc):
            raise ValueError("expired")
    except (ValueError, TypeError) as exc:
        raise RuntimeError("TSN_RECEIVER_NODE_LEASE_LOST: renewal returned an invalid expiry") from exc
