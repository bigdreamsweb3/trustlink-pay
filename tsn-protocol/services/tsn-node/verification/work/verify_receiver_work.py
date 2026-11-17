"""_verify_receiver_work: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
import hashlib
from core.schemas.create_intent_request import CreateIntentRequest
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TCAP_PROGRAM_ID: Any
    _construct_verified_tcap_transition: Callable[..., Any]
    _normalize_tin_operation_input: Callable[..., Any]
    _parse_signed_tcap_deposit_instructions: Callable[..., Any]
    _receiver_work_by_id: Callable[..., Any]
    _select_tcap_private_funding_deposit: Callable[..., Any]
    _simulate_owner_signed_tcap_deposit: Callable[..., Any]
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
    if kind == "AUTHORIZED_FUNDING":
        request = CreateIntentRequest(**payload)
        verified_fields = await node._verify_payment_authorization_from_signed_message(request)
        if request.senderFundingMode != "tcap_funded_note_v1":
            raise ValueError("Only the TCAP funded-note GPRU TIN credit path is supported")
        signed_deposit = node._parse_signed_tcap_deposit_instructions(str(request.senderSignedFundingTransaction or ""))
        deposit_program, deposit_accounts, deposit_data = node._select_tcap_private_funding_deposit(signed_deposit)
        decimals = int(verified_fields["tokenDecimals"])
        expected_amount = node.ui_amount_to_base_units(request.amount, decimals)
        if (
            deposit_program != node.TCAP_PROGRAM_ID
            or len(deposit_accounts) != 9
            or deposit_accounts[0] != str(request.senderWallet)
            or deposit_accounts[2] != str(verified_fields["tcapAssetEntry"])
            or deposit_accounts[6] != str(request.tokenMintAddress)
            or deposit_accounts[7] != str(verified_fields["tokenProgram"])
            or len(deposit_data) != 48
            or deposit_data[:8] != hashlib.sha256(b"global:deposit_private_funding_v1").digest()[:8]
            or int.from_bytes(deposit_data[8:16], "little") != expected_amount
            or deposit_data[16:48].hex() != request.fundingNote["commitment"]
            or deposit_accounts[8] != str(node.funding_root_address(node.TCAP_PROGRAM_ID)[0])
        ):
            raise ValueError("Wallet-signed TCAP deposit does not match the authorized sender, token, or amount")
        simulation = await node._simulate_owner_signed_tcap_deposit(str(request.senderSignedFundingTransaction))
        return {
            "verifiedPayload": {**request.model_dump(), **verified_fields},
            "verificationType": "TSN_TCAP_V2_GPRU_CREDIT_INTENT",
            "programSimulation": simulation,
        }
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
