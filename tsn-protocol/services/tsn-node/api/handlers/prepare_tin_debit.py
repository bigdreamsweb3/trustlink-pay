"""Resolve the authenticated debit context before sender approval."""
from core.schemas.tin_debit_request import TinDebitPrepareRequest
from settlement.debit.read_context import read_debit_context
from fastapi import HTTPException
import hashlib
import time
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError
from datetime import datetime, timezone
from verification.intent.build_canonical_message import _build_canonical_message


from typing import Any, Callable, Protocol


class Dependencies(Protocol):
    TSN_CANONICAL_DOMAIN_DISPLAY: str
    TSN_PROGRAM_ID: str
    TCAP_PROGRAM_ID: str
    GPRU_PROGRAM_ID: str
    TINS_PROGRAM_ID: str
    TOKEN_PROGRAM_ID: Any
    TOKEN_2022_PROGRAM_ID: Any
    solana_rpc: Callable[..., Any]
    get_mother_escrow_pda: Callable[..., Any]
    read_onchain_tin_tip_route: Callable[..., Any]


async def prepare_tin_debit_request(node: Dependencies, request: TinDebitPrepareRequest) -> dict:
    sender = await node.read_onchain_tin_tip_route(request.senderTin)
    recipient = await node.read_onchain_tin_tip_route(request.recipientTin)
    if not sender or not recipient or request.senderTin == request.recipientTin:
        raise HTTPException(422, "TIN_DEBIT_ROUTES_UNAVAILABLE")
    now = int(time.time())
    if not now <= int(request.expiresAt) <= now + 300:
        raise HTTPException(403, "TIN_DEBIT_PREPARATION_AUTH_EXPIRED")
    public = bytes.fromhex(request.ownerPublicKey)
    expires = datetime.fromtimestamp(int(request.expiresAt), timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    message = _build_canonical_message(node, "TIN Balance Payment Preparation", [
        ("Sender TIN", request.senderTin),
        ("Recipient TIN", request.recipientTin),
        ("Token Mint", request.tokenMintAddress),
        ("Expires", expires),
    ]).encode("utf-8")
    try:
        if hashlib.sha256(public).hexdigest() != sender["ownerPubkeyHash"]:
            raise ValueError("owner")
        VerifyKey(public).verify(message, bytes.fromhex(request.signature))
    except (BadSignatureError, ValueError) as exc:
        raise HTTPException(403, "TIN_DEBIT_PREPARATION_OWNER_REQUIRED") from exc
    try:
        context = await read_debit_context(node, request.tokenMintAddress)
    except ValueError as exc:
        detail = "TIN_DEBIT_VERIFIER_UNAVAILABLE" if str(exc) == "TIN_DEBIT_VERIFIER_UNAVAILABLE" else "TIN_DEBIT_CONTEXT_UNAVAILABLE"
        raise HTTPException(503, detail) from exc
    return {"tokenId": context["asset"]["tokenId"], "decimals": context["asset"]["decimals"],
        "senderRouteKeyCommitment": sender["gpruElgamalKeyCommitment"],
        "recipientRouteKeyCommitment": recipient["gpruElgamalKeyCommitment"],
        "oldGlobalRoot": context["oldRoot"], "tipRouteRoot": context["tipRoot"], "rootSequence": str(context["rootSequence"]),
        "deploymentCommitment": context["deploymentCommitment"], "validAfterSlot": str(context["slot"]),
        "expiresAtSlot": str(context["slot"] + 2000)}
