"""receiver_verification_worker: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
import asyncio
import httpx
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_LOCAL_FLOW_LOGS: Any
    TSN_NODE_ID: Any
    TSN_RECEIVER_NODE_API_KEY: Any
    _coordinate_private_credit_work: Callable[..., Any]
    _private_coordination_pending: Any
    _process_receiver_work_with_lease: Callable[..., Any]
    _receiver_wake_event: Any
    logger: Any
    receiver_request: Callable[..., Any]


async def receiver_verification_worker(node: Dependencies) -> None:
    headers = {"x-api-key": node.TSN_RECEIVER_NODE_API_KEY, "content-type": "application/json"}
    if node._receiver_wake_event is None:
        raise RuntimeError("TSN Receiver wake event is not initialized")
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            # Sleep without a timer or network request until the Receiver sends
            # an authenticated wake. This is the important CPU/quota boundary.
            node.logger.info("TSN Receiver verifier sleeping; waiting for wake")
            if node._private_coordination_pending:
                try: await asyncio.wait_for(node._receiver_wake_event.wait(), timeout=8)
                except asyncio.TimeoutError: pass
            else:
                await node._receiver_wake_event.wait()
            node._receiver_wake_event.clear()
            node.logger.info("TSN Receiver verifier woke; draining authenticated work")
            retry_delay = 2.0
            consecutive_failures = 0
            while True:
                try:
                    await node._coordinate_private_credit_work(client, headers)
                    leased_work = await node.receiver_request(client, "POST", "/api/internal/node/work", headers=headers, json={
                        "nodeId": node.TSN_NODE_ID,
                        "supportedKinds": ["AUTHORIZED_FUNDING", "TIN_OPERATION", "SETTLEMENT", "TCAP_EPOCH_ACCOUNTING"],
                    })
                    leased_work.raise_for_status()
                    work = leased_work.json().get("work")
                    if not work:
                        # Queue drained. Return to the event wait; no polling.
                        node.logger.info("TSN Receiver verifier drained queue; sleeping")
                        break
                    lease_context = {
                        "source": "tsn-receiver",
                        "workId": str(work.get("id") or ""),
                        "kind": str(work.get("kind") or ""),
                        "stateVersion": work.get("stateVersion"),
                        "payloadCommitment": str(work.get("payloadCommitment") or ""),
                    }
                    if node.TSN_LOCAL_FLOW_LOGS:
                        node.logger.info(
                            "TSN Receiver lease acquired: work_id=%s kind=%s state_version=%s payload_commitment=%s",
                            lease_context["workId"], lease_context["kind"],
                            lease_context["stateVersion"], lease_context["payloadCommitment"],
                        )
                    await node._process_receiver_work_with_lease(client, headers, work)
                    retry_delay = 2.0
                    consecutive_failures = 0
                except asyncio.CancelledError:
                    raise
                except Exception:
                    consecutive_failures += 1
                    node.logger.exception("TSN Receiver verification failed; retrying while awake")
                    if consecutive_failures >= 6:
                        node.logger.error(
                            "TSN Receiver verifier returning to sleep after %d consecutive failures",
                            consecutive_failures,
                        )
                        break
                    await asyncio.sleep(retry_delay)
                    retry_delay = min(30.0, retry_delay * 2)
