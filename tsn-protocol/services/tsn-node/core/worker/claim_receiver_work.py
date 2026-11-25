"""Claim and verify one Receiver item under its unchanged generation/lease guards.

An explicit phase selects funding preparation or completed wallet approvals;
the unfiltered worker request excludes funding so the two lanes cannot overlap.
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
    cache_receiver_work: Callable[..., Any]


async def claim_receiver_work(node: Dependencies, client: httpx.AsyncClient,
                              headers: dict[str, str], *, funding_phase: str | None = None) -> bool:
    if funding_phase not in (None, "AUTHORIZATION", "SIGNED_DEPOSIT"):
        raise ValueError("INVALID_NODE_FUNDING_FILTER")
    body = {"nodeId": node.TSN_NODE_ID, "supportedKinds": ["AUTHORIZED_FUNDING"] if funding_phase else
            ["TIN_OPERATION", "SETTLEMENT", "TIN_DEBIT", "TCAP_EPOCH_ACCOUNTING"]}
    if funding_phase:
        body["fundingPhase"] = funding_phase
    started = asyncio.get_running_loop().time()
    response = await node.receiver_request(client, "POST", "/api/internal/node/work", headers=headers, json=body)
    response.raise_for_status()
    work = response.json().get("work")
    if not work:
        return False
    if node.TSN_LOCAL_FLOW_LOGS:
        node.logger.info(
            "TSN Receiver lease acquired: work_id=%s kind=%s state_version=%s payload_commitment=%s claim_ms=%d funding_phase=%s",
            str(work.get("id") or ""), str(work.get("kind") or ""), work.get("stateVersion"),
            str(work.get("payloadCommitment") or ""), int((asyncio.get_running_loop().time() - started) * 1000),
            funding_phase,
        )
    await node.cache_receiver_work(work)
    await node._process_receiver_work_with_lease(client, headers, work)
    return True
