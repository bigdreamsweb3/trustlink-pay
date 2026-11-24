"""Resolve the authenticated debit context before sender approval."""
from core.schemas.tin_debit_request import TinDebitPrepareRequest
from settlement.debit.read_context import read_debit_context
from fastapi import HTTPException
import hashlib
import time
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError


from typing import Any, Callable, Protocol


class Dependencies(Protocol):
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
    message = b"TSN_TIN_DEBIT_PREPARE_V1\0" + "\n".join((request.senderTin, request.recipientTin, request.tokenMintAddress, request.expiresAt)).encode("ascii")
    try:
        if hashlib.sha256(public).hexdigest() != sender["ownerPubkeyHash"]:
            raise ValueError("owner")
        VerifyKey(public).verify(message, bytes.fromhex(request.signature))
    except (BadSignatureError, ValueError) as exc:
        raise HTTPException(403, "TIN_DEBIT_PREPARATION_OWNER_REQUIRED") from exc
    context = await read_debit_context(node, request.tokenMintAddress)
    return {"tokenId": context["asset"]["tokenId"], "decimals": context["asset"]["decimals"],
        "senderRouteKeyCommitment": sender["gpruElgamalKeyCommitment"],
        "recipientRouteKeyCommitment": recipient["gpruElgamalKeyCommitment"],
        "oldGlobalRoot": context["oldRoot"], "tipRouteRoot": context["tipRoot"], "rootSequence": str(context["rootSequence"]),
        "deploymentCommitment": context["deploymentCommitment"], "validAfterSlot": str(context["slot"]),
        "expiresAtSlot": str(context["slot"] + 2000)}
