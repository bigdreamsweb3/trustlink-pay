"""_verify_receiver_work: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
import hashlib
from core.schemas.create_intent_request import CreateIntentRequest
from transactions.native.funding.funding_blockhash_context import _funding_blockhash_context
from .prepare_receiver_funding import prepare_receiver_funding
from .verify_completed_funding import verify_completed_funding
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TCAP_PROGRAM_ID: Any
    _node_verification_message: Callable[..., Any]
    _node_verification_signing_key: Callable[..., Any]
    _stable_verification_json: Callable[..., Any]
    _parse_canonical_expiry: Callable[..., Any]
    solana_rpc: Callable[..., Any]
    _construct_verified_tcap_transition: Callable[..., Any]
    _normalize_tin_operation_input: Callable[..., Any]
    _parse_signed_tcap_deposit_instructions: Callable[..., Any]
    _receiver_work_by_id: Callable[..., Any]
    _select_tcap_private_funding_deposit: Callable[..., Any]
    _simulate_owner_signed_tcap_deposit: Callable[..., Any]
    _read_solana_shortvec: Callable[..., Any]
    _verify_payment_authorization_from_signed_message: Callable[..., Any]
    _verify_private_coordination_work: Callable[..., Any]
    assert_tin_operation_can_enter: Callable[..., Any]
    funding_root_address: Callable[..., Any]
    ui_amount_to_base_units: Callable[..., Any]


async def _verify_receiver_work(node: Dependencies, work: dict[str, Any]) -> dict[str, Any]:
    kind = str(work.get("kind") or "")
    payload = work.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("Receiver work payload must be an object")
    if kind == "TIN_DEBIT":
        from settlement.debit.prepare_work import prepare_debit_work
        return await prepare_debit_work(node, work)
    if kind == "AUTHORIZED_FUNDING":
        if work.get("fundingPhase") == "AUTHORIZATION":
            return await prepare_receiver_funding(node, work)
        if work.get("fundingPhase") == "SIGNED_DEPOSIT":
            return await verify_completed_funding(node, work)
        raise ValueError("Funding work lacks a staged authorization; inspect its original signature before a new approval")
    if kind == "SETTLEMENT":
        funding_id = str(payload.get("intentId") or "").strip()
        if not funding_id:
            raise ValueError("Settlement is missing its confirmed funding reference")
        funding = await node._receiver_work_by_id(funding_id)
        if funding.get("kind") != "AUTHORIZED_FUNDING" or funding.get("status") != "CONFIRMED":
            raise ValueError("Funding deposit is not confirmed")
        funding_payload = funding.get("payload") or {}
        if funding_payload.get("senderFundingMode") != "tcap_funded_note_v1":
            raise ValueError("Settlement is not a TCAP reserve deposit")
        transition = await node._construct_verified_tcap_transition(funding)
        return {
            "verifiedPayload": {"tcapCreditTransition": transition},
            "verificationType": "TSN_TCAP_GPRU_HIDDEN_HEAD_V1",
        }
    if kind == "TCAP_EPOCH_ACCOUNTING":
        return await node._verify_private_coordination_work(work)
    if kind == "TIN_OPERATION":
        normalized = node._normalize_tin_operation_input(payload)
        await node.assert_tin_operation_can_enter(normalized)
        return {
            "verifiedPayload": normalized,
            "hasPublicRouteEnvelope": False,
            "verificationType": "TSN_TIN_OPERATION",
        }
    raise ValueError(f"Unsupported Receiver work kind: {kind}")
