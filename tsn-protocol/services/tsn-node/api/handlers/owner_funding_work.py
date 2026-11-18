"""Authenticate a funding owner against the original privately stored message signature."""
from __future__ import annotations
import hmac
from typing import Any, Callable, Protocol
from fastapi import HTTPException
from core.schemas.funding_readiness_request import FundingReadinessRequest


class Dependencies(Protocol):
    _receiver_work_by_id: Callable[..., Any]
    _verify_ed25519_signature: Callable[..., Any]


async def owner_funding_work(node: Dependencies, request: FundingReadinessRequest) -> dict[str, Any]:
    work = await node._receiver_work_by_id(request.workId)
    payload = work.get("payload") or {}
    if (work.get("kind") != "AUTHORIZED_FUNDING"
        or payload.get("senderWallet") != request.senderPubkey
        or not hmac.compare_digest(str(payload.get("senderAuthorizationSignature") or ""), request.authorizationSignature)):
        raise HTTPException(403, "FUNDING_OWNER_AUTHORIZATION_REQUIRED")
    try:
        node._verify_ed25519_signature(public_key=request.senderPubkey,
            message=str(payload.get("senderAuthorizationMessage") or "").encode("utf-8"),
            signature_base64=request.authorizationSignature)
    except Exception as exc:
        raise HTTPException(403, "FUNDING_OWNER_AUTHORIZATION_REQUIRED") from exc
    return work
