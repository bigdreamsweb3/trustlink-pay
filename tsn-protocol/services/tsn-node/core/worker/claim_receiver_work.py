"""Claim and verify one Receiver item under its unchanged generation/lease guards.

The optional signed-deposit filter selects only completed wallet approvals.
Returns whether an item was processed; HTTP, lease and verification failures
propagate to the worker's bounded retry loop. No transaction bytes are changed.
"""
from __future__ import annotations
import asyncio
from typing import Any, Callable, Protocol
import httpx


class Dependencies(Protocol):
    TSN_LOCAL_FLOW_LOGS: Any
    TSN_NODE_ID: Any
    _process_receiver_work_with_lease: Callable[..., Any]
    logger: Any
    receiver_request: Callable[..., Any]


async def claim_receiver_work(node: Dependencies, client: httpx.AsyncClient,
                              headers: dict[str, str], *, signed_funding_only: bool = False) -> bool:
    body = {"nodeId": node.TSN_NODE_ID, "supportedKinds": ["AUTHORIZED_FUNDING"] if signed_funding_only else
            ["AUTHORIZED_FUNDING", "TIN_OPERATION", "SETTLEMENT", "TCAP_EPOCH_ACCOUNTING"]}
    if signed_funding_only:
        body["fundingPhase"] = "SIGNED_DEPOSIT"
    started = asyncio.get_running_loop().time()
    response = await node.receiver_request(client, "POST", "/api/internal/node/work", headers=headers, json=body)
    response.raise_for_status()
    work = response.json().get("work")
    if not work:
        return False
    if node.TSN_LOCAL_FLOW_LOGS:
        node.logger.info(
            "TSN Receiver lease acquired: work_id=%s kind=%s state_version=%s payload_commitment=%s claim_ms=%d signed_funding_only=%s",
            str(work.get("id") or ""), str(work.get("kind") or ""), work.get("stateVersion"),
            str(work.get("payloadCommitment") or ""), int((asyncio.get_running_loop().time() - started) * 1000),
            signed_funding_only,
        )
    await node._process_receiver_work_with_lease(client, headers, work)
    return True
