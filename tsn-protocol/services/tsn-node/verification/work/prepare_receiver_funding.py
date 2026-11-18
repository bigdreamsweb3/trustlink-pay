"""Verify message-only funding work and publish a bounded non-executable readiness decision."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Protocol
from core.schemas.create_intent_request import CreateIntentRequest
from transactions.native.funding.prepare_funding_deposit_accounts import prepare_funding_deposit_accounts


class Dependencies(Protocol):
    _verify_payment_authorization_from_signed_message: Callable[..., Any]
    ui_amount_to_base_units: Callable[..., Any]
    TCAP_PROGRAM_ID: str
    solana_rpc: Callable[..., Any]
    funding_root_address: Callable[..., Any]


async def prepare_receiver_funding(node: Dependencies, work: dict[str, Any]) -> dict[str, Any]:
    request = CreateIntentRequest(**work["payload"])
    commitment = str(work.get("authorizationPayloadCommitment") or "")
    if not commitment or commitment != work.get("payloadCommitment"):
        raise ValueError("Funding authorization commitment is missing or changed")
    verified = await node._verify_payment_authorization_from_signed_message(request,
        work_id=str(work["id"]), authorization_payload_commitment=commitment)
    amount = node.ui_amount_to_base_units(request.amount, int(verified["tokenDecimals"]))
    accounts = await prepare_funding_deposit_accounts(node, request, verified, amount)
    signed_expiry = datetime.fromisoformat(verified["senderAuthorizationExpiresAt"].replace("Z", "+00:00"))
    expiry = min(signed_expiry, datetime.now(timezone.utc) + timedelta(minutes=5))
    if expiry <= datetime.now(timezone.utc):
        raise ValueError("Payment authorization expired before funding was ready")
    return {"verificationType": "TSN_FUNDING_AUTHORIZATION_READY", "fundingReadiness": {
        "expiresAt": expiry.isoformat().replace("+00:00", "Z"), "authorizationPayloadCommitment": commitment},
        "authorizationPreflight": {"authorizationPayloadCommitment": commitment,
            "verifiedFields": verified, "depositAccounts": accounts,
            "depositAmountBaseUnits": str(amount), "fundingNoteCommitment": request.fundingNote["commitment"]}}
