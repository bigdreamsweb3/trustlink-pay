"""_verify_payment_authorization_from_signed_message: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from functools import partial
from .verify_payment_authorization_from_signed_message_key import verify_payment_authorization_from_signed_message_key
from datetime import datetime
from fastapi import HTTPException
from typing import Any
import json
import re
import time
from core.schemas.create_intent_request import CreateIntentRequest
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    _assert_canonical_nonce_unused: Callable[..., Any]
    _assert_recipient_hash_matches_owner: Callable[..., Any]
    _parse_canonical_expiry: Callable[..., Any]
    _parse_canonical_message: Callable[..., Any]
    _parse_usdc_base_units: Callable[..., Any]
    _verify_ed25519_signature: Callable[..., Any]
    read_onchain_tin_tip_route: Callable[..., Any]
    resolve_tcap_registered_asset: Callable[..., Any]
    resolve_tin_identity_for_verification: Callable[..., Any]
    ui_amount_to_base_units: Callable[..., Any]
    validate_funding_note: Callable[..., Any]
    verify_destination_route: Any


async def _verify_payment_authorization_from_signed_message(node: Dependencies, req: CreateIntentRequest) -> dict[str, Any]:
    mode = req.senderFundingMode or ""
    if mode != "tcap_funded_note_v1":
        raise HTTPException(400, "TSN requires a proof-bound private funded-note wallet deposit")
    is_cross_chain = (req.senderAuthorizationMessage or "").startswith("TSN Cross-Chain Payment Intent\n")
    action = "Cross-Chain Payment Intent" if is_cross_chain else "Payment Intent"
    fields = node._parse_canonical_message(req.senderAuthorizationMessage or "", action)
    note = node.validate_funding_note(req.fundingNote)
    if fields.get("Funding Note Commitment") != note["commitment"]:
        raise HTTPException(400, "Funding note commitment differs from the wallet-signed authorization")
    if is_cross_chain:
        amount_base_units = node._parse_usdc_base_units(str(fields.get("Amount") or ""), "Amount")
        fee_base_units = node._parse_usdc_base_units(str(fields.get("Fee") or ""), "Fee")
        token_metadata = {"mint": str(req.tokenMintAddress), "decimals": 6, "tokenId": 0, "assetEntry": "", "tokenProgram": ""}
    else:
        signed_mint = str(fields.get("Token Mint") or "").strip()
        if signed_mint != str(req.tokenMintAddress):
            raise HTTPException(400, "Token Mint differs from the wallet-signed payment authorization")
        try:
            token_metadata = await node.resolve_tcap_registered_asset(signed_mint)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        try:
            signed_decimals = int(str(fields.get("Token Decimals") or ""))
        except ValueError as exc:
            raise HTTPException(400, "Token Decimals is missing or invalid in the signed authorization") from exc
        if signed_decimals != token_metadata["decimals"]:
            raise HTTPException(400, "Signed token decimals differ from the active TCAP mint registration")
        amount_base_units = node.ui_amount_to_base_units(fields.get("Amount"), signed_decimals)
        fee_base_units = node.ui_amount_to_base_units(fields.get("Fee"), signed_decimals, allow_zero=True)
    recipient_tin = str(fields.get("Recipient TIN") or "")
    if not re.fullmatch(r"\d+", recipient_tin):
        raise HTTPException(400, "Recipient TIN must be plain digits in the signed message")
    if req.recipientTin and req.recipientTin != recipient_tin:
        raise HTTPException(400, "recipientTin differs from the signed message")
    if fields.get("Recipient Route Commitment") or fields.get("Recipient Route Version"):
        raise HTTPException(400, "Sender authorization must contain the recipient TIN, not resolved route data")
    token_decimals = int(token_metadata["decimals"])
    request_amount_base_units = node.ui_amount_to_base_units(req.amount, token_decimals)
    if amount_base_units != request_amount_base_units:
        raise HTTPException(400, "amount differs from the signed message")
    request_fee_base_units = node.ui_amount_to_base_units(req.senderFeeAmount or 0, token_decimals, allow_zero=True)
    if fee_base_units != request_fee_base_units:
        raise HTTPException(400, "senderFeeAmount differs from the signed message")
    if req.senderAuthorizationNonce and req.senderAuthorizationNonce != fields.get("Nonce"):
        raise HTTPException(400, "senderAuthorizationNonce differs from the signed message")
    expires_at = node._parse_canonical_expiry(str(fields.get("Expires") or ""))
    if req.senderAuthorizationExpiresAt:
        submitted_expiry = datetime.fromisoformat(req.senderAuthorizationExpiresAt.replace("Z", "+00:00"))
        if submitted_expiry != expires_at:
            raise HTTPException(400, "senderAuthorizationExpiresAt differs from the signed message")
    cross_chain_fields: dict[str, str] = {}
    if is_cross_chain:
        intent_id = str(fields.get("Intent ID") or "").strip()
        asset = str(fields.get("Asset") or "").strip().lower()
        destination_network = str(fields.get("Destination Network") or "").strip()
        destination_executor = str(fields.get("Destination Executor") or "").strip().lower()
        settlement_route_id = str(fields.get("Settlement Route ID") or "").strip().lower()
        if not intent_id or intent_id != req.paymentId:
            raise HTTPException(400, "Intent ID differs from the signed cross-chain intent")
        if not asset or not req.destinationToken or asset != req.destinationToken.lower():
            raise HTTPException(400, "destination asset differs from the signed cross-chain intent")
        if not destination_network or not re.fullmatch(r"[a-z0-9-]+", destination_network):
            raise HTTPException(400, "destination network is invalid")
        if not re.fullmatch(r"0x[0-9a-f]{40}", destination_executor):
            raise HTTPException(400, "destination executor must be a 20-byte EVM address")
        if not re.fullmatch(r"[0-9a-f]{64}", settlement_route_id):
            raise HTTPException(400, "settlement route ID must be a 32-byte hexadecimal commitment")
        if req.destinationNetwork and req.destinationNetwork != destination_network:
            raise HTTPException(400, "destinationNetwork differs from the signed message")
        if req.destinationExecutor and req.destinationExecutor.lower() != destination_executor:
            raise HTTPException(400, "destinationExecutor differs from the signed message")
        if req.settlementRouteId and req.settlementRouteId.lower().removeprefix("0x") != settlement_route_id:
            raise HTTPException(400, "settlementRouteId differs from the signed message")
        cross_chain_fields = {
            "destinationNetwork": destination_network,
            "destinationExecutor": destination_executor,
            "destinationToken": asset,
            "settlementRouteId": f"0x{settlement_route_id}",
        }
    sender_public_key = str(req.senderWallet or "").strip()
    node._verify_ed25519_signature(
        public_key=sender_public_key,
        message=(req.senderAuthorizationMessage or "").encode("utf-8"),
        signature_base64=str(req.senderAuthorizationSignature or ""),
    )
    if not is_cross_chain:
        signed_display_name = fields.get("Recipient Display Name")
        signed_display_name_source = fields.get("Recipient Display Name Source")
        signed_credentials_json = fields.get("Recipient Verified Credentials")
        if signed_display_name is None or signed_display_name_source is None or signed_credentials_json is None:
            raise HTTPException(400, "Payment authorization must sign the resolved recipient identity")
        resolved_identity = await node.resolve_tin_identity_for_verification(recipient_tin)
        if resolved_identity is None:
            raise HTTPException(422, "Recipient TIN identity could not be resolved by Node")
        resolved_display_name = str(resolved_identity.get("displayName") or "").strip() or "(not provided)"
        expected_name_source = "owner-provided" if resolved_display_name != "(not provided)" else "not provided"
        if signed_display_name != resolved_display_name or signed_display_name_source != expected_name_source:
            raise HTTPException(400, "Signed recipient display name does not match Node TIN resolution")
        try:
            signed_credentials = json.loads(signed_credentials_json)
        except (TypeError, json.JSONDecodeError) as exc:
            raise HTTPException(400, "Signed recipient credentials are invalid JSON") from exc
        if not isinstance(signed_credentials, list):
            raise HTTPException(400, "Signed recipient credentials must be a list")
        node_credentials = resolved_identity.get("verifiedCredentials") or []
        canonical_credentials = verify_payment_authorization_from_signed_message_key
        if canonical_credentials(signed_credentials) != canonical_credentials(node_credentials):
            raise HTTPException(400, "Signed recipient credentials do not match Node-verified credentials")
    await node._assert_canonical_nonce_unused(
        action=action,
        authorization_domain=str(fields.get("Domain") or "").strip(),
        sender_public_key=sender_public_key,
        nonce=str(fields.get("Nonce") or "").strip(),
    )
    if is_cross_chain:
        try:
            await node.verify_destination_route(
                network=cross_chain_fields["destinationNetwork"],
                route_id=cross_chain_fields["settlementRouteId"],
                executor=cross_chain_fields["destinationExecutor"],
                token=cross_chain_fields["destinationToken"],
                requested_amount=amount_base_units,
                now_seconds=int(time.time()),
            )
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(409, f"destination route preflight failed: {exc}") from exc
    route = await node.read_onchain_tin_tip_route(recipient_tin)
    if not route:
        raise HTTPException(422, "Recipient TIN has no active TIP route")
    node._assert_recipient_hash_matches_owner(req.recipientHash, str(route.get("ownerPubkeyHash") or ""))
    recipient_route_commitment = str(route["gpruElgamalKeyCommitment"]).lower()
    recipient_route_version = int(route["tipRouteVersion"])
    return {
        "recipientTin": recipient_tin,
        "recipientRouteCommitment": recipient_route_commitment,
        "recipientRouteVersion": recipient_route_version,
        "tokenMintAddress": token_metadata["mint"],
        "tokenId": token_metadata["tokenId"],
        "tokenDecimals": token_metadata["decimals"],
        "tcapAssetEntry": token_metadata["assetEntry"],
        "tokenProgram": token_metadata["tokenProgram"],
        "senderAuthorizationNonce": str(fields["Nonce"]),
        "senderAuthorizationExpiresAt": expires_at.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        **cross_chain_fields,
    }
