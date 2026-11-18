"""Return only the owner's verified deposit account projection for explicit approval."""
from __future__ import annotations
from typing import Any, Callable, Protocol
from fastapi import HTTPException
from core.schemas.funding_readiness_request import FundingReadinessRequest
from .owner_funding_work import owner_funding_work
from verification.work.funding_authorization_preflight import funding_authorization_preflight


class Dependencies(Protocol):
    _receiver_work_by_id: Callable[..., Any]
    _verify_ed25519_signature: Callable[..., Any]
    _node_verification_message: Callable[..., Any]
    _node_verification_signing_key: Callable[..., Any]
    _stable_verification_json: Callable[..., Any]


async def post_funding_readiness(node: Dependencies, request: FundingReadinessRequest) -> dict[str, Any]:
    work = await owner_funding_work(node, request)
    if work.get("status") != "FUNDING_READY" or work.get("fundingPhase") != "AUTHORIZATION":
        raise HTTPException(409, "FUNDING_NOT_READY")
    try:
        preflight = funding_authorization_preflight(node, work)
    except ValueError as exc:
        raise HTTPException(409, "FUNDING_READINESS_INVALID_OR_EXPIRED") from exc
    return {"workId": work["id"], "stateVersion": work["stateVersion"],
        "authorizationPayloadCommitment": work["authorizationPayloadCommitment"],
        "expiresAt": work["fundingReadiness"]["expiresAt"],
        "depositAccounts": preflight["depositAccounts"], "amountBaseUnits": preflight["depositAmountBaseUnits"]}
