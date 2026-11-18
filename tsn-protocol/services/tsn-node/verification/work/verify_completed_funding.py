"""Fast final pass reuses verified authorization and checks only its immutable signed deposit."""
from __future__ import annotations
from typing import Any, Callable, Protocol
from core.schemas.signed_funding_request import SignedFundingRequest
from transactions.native.funding.funding_blockhash_context import _funding_blockhash_context
from transactions.native.funding.verify_signed_tcap_deposit_contract import _verify_signed_tcap_deposit_contract
from .funding_authorization_preflight import funding_authorization_preflight


class Dependencies(Protocol):
    TCAP_PROGRAM_ID: str
    _node_verification_message: Callable[..., Any]
    _node_verification_signing_key: Callable[..., Any]
    _stable_verification_json: Callable[..., Any]
    _read_solana_shortvec: Callable[..., Any]
    _parse_signed_tcap_deposit_instructions: Callable[..., Any]
    _select_tcap_private_funding_deposit: Callable[..., Any]
    funding_root_address: Callable[..., Any]
    _parse_canonical_expiry: Callable[..., Any]
    _simulate_owner_signed_tcap_deposit: Callable[..., Any]
    ui_amount_to_base_units: Callable[..., Any]


async def verify_completed_funding(node: Dependencies, work: dict[str, Any]) -> dict[str, Any]:
    request = SignedFundingRequest(**work["payload"])
    context = _funding_blockhash_context(node, request.senderSignedFundingTransaction, request.senderFundingBlockhashContext.model_dump())
    preflight = funding_authorization_preflight(node, work, check_ready_expiry=False)
    verified = preflight["verifiedFields"]
    node._parse_canonical_expiry(verified["senderAuthorizationExpiresAt"])
    if node.ui_amount_to_base_units(request.amount, int(verified["tokenDecimals"])) != int(preflight["depositAmountBaseUnits"]):
        raise ValueError("Funding amount differs from the original signed authorization")
    _verify_signed_tcap_deposit_contract(node, transaction_base64=request.senderSignedFundingTransaction,
        transition=preflight, wallet=request.senderWallet)
    simulation = await node._simulate_owner_signed_tcap_deposit(request.senderSignedFundingTransaction, context)
    return {"verifiedPayload": {**request.model_dump(), **verified},
        "verificationType": "TSN_TCAP_V2_GPRU_CREDIT_INTENT", "programSimulation": simulation}
