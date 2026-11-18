"""Validate owner-approved bytes then ask Receiver to attach them atomically to the same intent."""
from __future__ import annotations
from typing import Any, Callable, Protocol
from fastapi import HTTPException
import httpx
from core.schemas.complete_funding_request import CompleteFundingRequest
from .owner_funding_work import owner_funding_work
from verification.work.funding_authorization_preflight import funding_authorization_preflight
from transactions.native.funding.funding_blockhash_context import _funding_blockhash_context
from transactions.native.funding.verify_signed_tcap_deposit_contract import _verify_signed_tcap_deposit_contract


class Dependencies(Protocol):
    TSN_RECEIVER_NODE_API_KEY: str
    TCAP_PROGRAM_ID: str
    _receiver_work_by_id: Callable[..., Any]
    _verify_ed25519_signature: Callable[..., Any]
    _node_verification_message: Callable[..., Any]
    _node_verification_signing_key: Callable[..., Any]
    _stable_verification_json: Callable[..., Any]
    _read_solana_shortvec: Callable[..., Any]
    _parse_signed_tcap_deposit_instructions: Callable[..., Any]
    _select_tcap_private_funding_deposit: Callable[..., Any]
    funding_root_address: Callable[..., Any]
    receiver_request: Callable[..., Any]


async def post_complete_funding(node: Dependencies, request: CompleteFundingRequest) -> dict[str, Any]:
    work = await owner_funding_work(node, request)
    if work.get("authorizationPayloadCommitment") != request.authorizationPayloadCommitment:
        raise HTTPException(409, "FUNDING_AUTHORIZATION_COMMITMENT_MISMATCH")
    payload = work.get("payload") or {}
    if work.get("fundingPhase") == "SIGNED_DEPOSIT":
        if (payload.get("senderSignedFundingTransaction") != request.senderFundingDepositTxB64
            or payload.get("senderFundingBlockhashContext") != request.senderFundingBlockhashContext.model_dump()):
            raise HTTPException(409, "FUNDING_ATTACHMENT_CONFLICT")
    else:
        if work.get("status") != "FUNDING_READY" or work.get("fundingPhase") != "AUTHORIZATION":
            raise HTTPException(409, "FUNDING_NOT_READY")
        if work.get("stateVersion") != request.expectedStateVersion:
            raise HTTPException(409, "STALE_STATE_VERSION")
        try:
            preflight = funding_authorization_preflight(node, work)
            _funding_blockhash_context(node, request.senderFundingDepositTxB64, request.senderFundingBlockhashContext.model_dump())
            _verify_signed_tcap_deposit_contract(node, transaction_base64=request.senderFundingDepositTxB64,
                transition=preflight, wallet=request.senderPubkey)
        except ValueError as exc:
            raise HTTPException(422, "SIGNED_FUNDING_DIFFERS_FROM_APPROVAL_OR_READINESS_EXPIRED") from exc
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await node.receiver_request(client, "POST", "/api/internal/node/work/funding",
                headers={"x-api-key": node.TSN_RECEIVER_NODE_API_KEY, "content-type": "application/json"},
                json={"id": request.workId, "expectedVersion": request.expectedStateVersion,
                    "authorizationPayloadCommitment": request.authorizationPayloadCommitment,
                    "senderSignedFundingTransaction": request.senderFundingDepositTxB64,
                    "senderFundingBlockhashContext": request.senderFundingBlockhashContext.model_dump()})
    except (httpx.RequestError, RuntimeError) as exc:
        raise HTTPException(503, "FUNDING_ATTACHMENT_OUTCOME_UNKNOWN_CHECK_SAME_WORK") from exc
    if response.is_error:
        raise HTTPException(response.status_code, "FUNDING_ATTACHMENT_REFUSED_CHECK_SAME_WORK")
    attached = response.json().get("work") or {}
    return {"workId": request.workId, "stateVersion": attached.get("stateVersion"),
        "status": attached.get("status"), "fundingPhase": attached.get("fundingPhase")}
