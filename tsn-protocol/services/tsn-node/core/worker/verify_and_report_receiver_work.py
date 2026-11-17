"""_verify_and_report_receiver_work: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
from funding_snapshot_sync import FUNDING_ROOT_CHANGED
from private_credit_coordination import PrivateCreditWait
from typing import Any
import asyncio
import httpx
import re
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_LOCAL_FLOW_LOGS: Any
    TSN_NODE_ID: Any
    _sign_node_verification: Callable[..., Any]
    _verification_rejection_reason: Callable[..., Any]
    _verify_receiver_work: Callable[..., Any]
    logger: Any
    receiver_request: Callable[..., Any]


async def _verify_and_report_receiver_work(node: Dependencies, client: httpx.AsyncClient, headers: dict[str, str], work: dict[str, Any]) -> None:
    lease_context = {
        "source": "tsn-receiver", "workId": str(work.get("id") or ""),
        "kind": str(work.get("kind") or ""), "stateVersion": work.get("stateVersion"),
        "payloadCommitment": str(work.get("payloadCommitment") or ""),
    }
    retry_delay = 2.0
    while True:
        try:
            evidence = await node._verify_receiver_work(work)
            evidence = {**evidence, "receiverLease": lease_context}
            status = "VERIFIED"
            break
        except PrivateCreditWait as exc:
            response = await node.receiver_request(client, "POST", "/api/internal/node/coordination", headers=headers, json={
                "action": "defer", "id": work["id"], "owner": node.TSN_NODE_ID, "expectedVersion": work["stateVersion"], "seconds": exc.seconds})
            response.raise_for_status()
            return
        except Exception as exc:
            if isinstance(exc, ValueError) and str(exc) in (FUNDING_ROOT_CHANGED, "TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT", "TCAP_CREDIT_EPOCH_CHANGED_BEFORE_SETTLEMENT"):
                response = await node.receiver_request(client, "POST", "/api/internal/node/coordination", headers=headers, json={
                    "action": "defer", "id": work["id"], "owner": node.TSN_NODE_ID, "expectedVersion": work["stateVersion"], "seconds": 8})
                response.raise_for_status()
                return
            if (isinstance(exc, HTTPException) and exc.status_code >= 500
                    or isinstance(exc, httpx.RequestError)):
                # The outer processing window and lease renewal bound retries.
                # Unavailable RPC/proving services do not invalidate approval.
                node.logger.warning("Receiver verification temporarily unavailable: id=%s; retrying", work.get("id"))
                await asyncio.sleep(retry_delay)
                retry_delay = min(10.0, retry_delay * 2)
                continue
            reason = node._verification_rejection_reason(exc)
            node.logger.warning("Receiver work rejected: id=%s reason=%s", work.get("id"), reason)
            evidence = {"reason": reason, "receiverLease": lease_context}
            status = "REJECTED"
            break
    evidence["nodeAttestation"] = node._sign_node_verification(
        work=work, status=status, evidence=evidence,
        verification_type=str(evidence.get("verificationType") or ""),
    )
    response = await node.receiver_request(client, "PATCH", "/api/internal/node/work", headers=headers, json={
        "id": work["id"], "owner": node.TSN_NODE_ID, "expectedVersion": work["stateVersion"],
        "status": status, "evidence": evidence,
    })
    if response.is_error:
        # Only log Receiver's bounded error code, never its raw response body.
        try:
            code = response.json().get("error")
        except (ValueError, AttributeError):
            code = None
        if isinstance(code, str) and re.fullmatch(r"[A-Z][A-Z0-9_]{0,79}", code):
            node.logger.error("Receiver decision refused: work_id=%s error=%s", work["id"], code)
    response.raise_for_status()
    if node.TSN_LOCAL_FLOW_LOGS:
        node.logger.info("TSN Receiver work transitioned: work_id=%s status=%s verified_payload_commitment=%s",
                    work["id"], status, lease_context["payloadCommitment"])
