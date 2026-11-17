"""post_intent: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from fastapi import HTTPException
import httpx
from core.schemas.create_intent_request import CreateIntentRequest
from core.schemas.public_mempool_intent import PublicMempoolIntent
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_RECEIVER_NODE_API_KEY: Any
    TSN_RECEIVER_URL: Any
    logger: Any
    receiver_request: Callable[..., Any]


async def post_intent(node: Dependencies, req: CreateIntentRequest) -> PublicMempoolIntent:
    """Persist a payment intent at Receiver ingress for asynchronous Node verification."""
    if not node.TSN_RECEIVER_URL or not node.TSN_RECEIVER_NODE_API_KEY:
        raise HTTPException(503, "TSN Receiver is required for payment-intent processing")

    headers = {"x-api-key": node.TSN_RECEIVER_NODE_API_KEY, "content-type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await node.receiver_request(
                client,
                "POST",
                "/intents",
                headers=headers,
                json=req.model_dump(exclude_none=True),
            )
    except (httpx.RequestError, RuntimeError) as exc:
        raise HTTPException(503, "TSN Receiver could not accept the payment intent") from exc
    if response.status_code >= 400:
        detail = "TSN Receiver rejected the payment intent"
        try:
            detail = str(response.json().get("error") or detail)
        except (ValueError, AttributeError):
            pass
        raise HTTPException(response.status_code, detail)
    received = response.json()
    now = str(received.get("postedAt") or datetime.now(timezone.utc).isoformat())
    node.logger.info("Payment intent accepted by Receiver: work_id=%s", received.get("id"))
    return PublicMempoolIntent(
        id=str(received.get("id") or req.paymentId),
        paymentId=req.paymentId,
        intentSeedHash=req.intentSeedHash,
        recipientHash=req.recipientHash,
        tokenMintAddress=req.tokenMintAddress,
        amount=req.amount,
        recipientAmount=req.recipientAmount,
        source=req.source,
        status=str(received.get("status") or "pending"),
        postedAt=now,
        updatedAt=str(received.get("updatedAt") or now),
    )
