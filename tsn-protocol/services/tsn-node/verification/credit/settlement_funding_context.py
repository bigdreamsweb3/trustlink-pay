"""_settlement_funding_context: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
from core.schemas.confirmed_funding_request import ConfirmedFundingRequest
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    _parse_canonical_message: Callable[..., Any]
    _parse_signed_tcap_deposit_instructions: Callable[..., Any]
    _select_tcap_private_funding_deposit: Callable[..., Any]
    _verify_confirmed_tcap_deposit: Callable[..., Any]
    _verify_ed25519_signature: Callable[..., Any]
    funding_nullifier: Callable[..., Any]
    resolve_tcap_registered_asset: Callable[..., Any]
    ui_amount_to_base_units: Callable[..., Any]
    validate_funding_note: Callable[..., Any]


async def _settlement_funding_context(node: Dependencies, funding: dict[str, Any]) -> tuple[ConfirmedFundingRequest, dict[str, Any], dict[str, Any]]:
    if funding.get("kind") != "AUTHORIZED_FUNDING" or funding.get("status") != "CONFIRMED":
        raise ValueError("Settlement funding is not confirmed")
    request = ConfirmedFundingRequest(**(funding.get("payload") or {}))
    fields = node._parse_canonical_message(request.senderAuthorizationMessage, "Payment Intent")
    node._verify_ed25519_signature(public_key=request.senderWallet, message=request.senderAuthorizationMessage.encode("utf-8"), signature_base64=request.senderAuthorizationSignature)
    if fields.get("Recipient TIN") != request.recipientTin or fields.get("Token Mint") != request.tokenMintAddress or fields.get("Nonce") != request.senderAuthorizationNonce:
        raise ValueError("Settlement funding differs from its wallet-signed recipient, token, or nonce")
    asset = await node.resolve_tcap_registered_asset(request.tokenMintAddress)
    if fields.get("Token Decimals") != str(asset["decimals"]):
        raise ValueError("Settlement token decimals differ from the signed payment")
    amount = node.ui_amount_to_base_units(fields.get("Amount"), asset["decimals"])
    if amount != node.ui_amount_to_base_units(request.amount, asset["decimals"]):
        raise ValueError("Settlement amount differs from the wallet-signed payment")
    instructions = node._parse_signed_tcap_deposit_instructions(request.senderSignedFundingTransaction)
    deposit = node._select_tcap_private_funding_deposit(instructions)
    if len(deposit[1]) != 9:
        raise ValueError("Settlement requires the exact wallet-signed TCAP deposit")
    names = ("depositor", "config", "assetEntry", "reserveState", "source", "vault", "mint", "tokenProgram", "fundingRootAccount")
    accounts = dict(zip(names, deposit[1]))
    if accounts["assetEntry"] != asset["assetEntry"] or accounts["tokenProgram"] != asset["tokenProgram"]:
        raise ValueError("Settlement funding asset differs from the current TCAP registration")
    note = node.validate_funding_note(request.fundingNote)
    if fields.get("Funding Note Commitment") != note["commitment"]:
        raise ValueError("Confirmed funding note differs from the signed payment commitment")
    context = {"depositAccounts": accounts, "depositAmountBaseUnits": str(amount), "fundingNoteCommitment": note["commitment"]}
    receipt = await node._verify_confirmed_tcap_deposit(funding_work=funding, transition=context, wallet=request.senderWallet, token_mint=request.tokenMintAddress)
    # The circuit enforces this same secret relation and funded membership.
    # Re-verification retains the original opening, so retry/root changes cannot
    # issue another nullifier for the same funded note.
    nullifier = node.funding_nullifier(note)
    return request, asset, {**context, "receipt": receipt, "nullifier": nullifier}
