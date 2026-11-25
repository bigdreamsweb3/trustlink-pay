"""receiver_verification_worker: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
import asyncio
import httpx
from .claim_receiver_work import claim_receiver_work
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_LOCAL_FLOW_LOGS: Any
    TSN_NODE_ID: Any
    TSN_RECEIVER_NODE_API_KEY: Any
    _coordinate_private_credit_work: Callable[..., Any]
    _private_coordination_pending: Any
    _process_receiver_work_with_lease: Callable[..., Any]
    _receiver_wake_event: Any
    _receiver_funding_wake_event: Any
    logger: Any
    receiver_request: Callable[..., Any]


async def receiver_verification_worker(node: Dependencies, *, signed_funding_only: bool = False) -> None:
    headers = {"x-api-key": node.TSN_RECEIVER_NODE_API_KEY, "content-type": "application/json"}
    wake = node._receiver_funding_wake_event if signed_funding_only else node._receiver_wake_event
    lane = "signed funding" if signed_funding_only else "ordinary"
    if wake is None:
        raise RuntimeError("TSN Receiver wake event is not initialized")
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            # Sleep without a timer or network request until the Receiver sends
            # an authenticated wake. This is the important CPU/quota boundary.
            node.logger.info("TSN Receiver verifier sleeping; waiting for wake lane=%s", lane)
            if not signed_funding_only and node._private_coordination_pending:
                try: await asyncio.wait_for(wake.wait(), timeout=8)
                except asyncio.TimeoutError: pass
            else:
                await wake.wait()
            wake.clear()
            node.logger.info("TSN Receiver verifier woke; draining authenticated work lane=%s", lane)
            retry_delay = 2.0
            consecutive_failures = 0
            while True:
                try:
                    # The signed lane never waits for ordinary proving/accounting.
                    # The other lane prepares message-only approvals, then retains
                    # the serialized shared-root queue and accounting ordering.
                    priority_processed = await claim_receiver_work(node, client, headers,
                        funding_phase="SIGNED_DEPOSIT" if signed_funding_only else "AUTHORIZATION")
                    normal_processed = False
                    if not signed_funding_only:
                        await node._coordinate_private_credit_work(client, headers)
                        normal_processed = await claim_receiver_work(node, client, headers)
                    if not priority_processed and not normal_processed:
                        # Queue drained. Return to the event wait; no polling.
                        node.logger.info("TSN Receiver verifier drained queue; sleeping lane=%s", lane)
                        break
                    retry_delay = 2.0
                    consecutive_failures = 0
                except asyncio.CancelledError:
                    raise
                except Exception:
                    consecutive_failures += 1
                    node.logger.exception("TSN Receiver verification failed; retrying while awake lane=%s", lane)
                    if consecutive_failures >= 6:
                        node.logger.error(
                            "TSN Receiver verifier returning to sleep after %d consecutive failures lane=%s",
                            consecutive_failures, lane,
                        )
                        break
                    await asyncio.sleep(retry_delay)
                    retry_delay = min(30.0, retry_delay * 2)
