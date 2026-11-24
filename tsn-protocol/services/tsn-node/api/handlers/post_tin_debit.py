"""Accept a sender-approved private debit through encrypted Receiver ingress."""
import httpx
import hashlib
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError
from fastapi import HTTPException
from core.schemas.tin_debit_request import TinDebitRequest
from settlement.debit.preparation.commitments import commitments
from settlement.debit.preparation.verify_approval import verify_approval
from settlement.debit.preparation.opening_message import opening_message
from settlement.debit.read_context import read_debit_context


from typing import Any, Callable, Protocol


class Dependencies(Protocol):
    TSN_PROGRAM_ID: str
    TCAP_PROGRAM_ID: str
    GPRU_PROGRAM_ID: str
    TINS_PROGRAM_ID: str
    TOKEN_PROGRAM_ID: Any
    TOKEN_2022_PROGRAM_ID: Any
    TSN_RECEIVER_URL: str
    TSN_RECEIVER_NODE_API_KEY: str
    solana_rpc: Callable[..., Any]
    get_mother_escrow_pda: Callable[..., Any]
    read_onchain_tin_tip_route: Callable[..., Any]
    receiver_request: Callable[..., Any]
    _receiver_work_by_id: Callable[..., Any]


async def post_tin_debit(node: Dependencies, request: TinDebitRequest) -> dict:
    if not node.TSN_RECEIVER_URL or not node.TSN_RECEIVER_NODE_API_KEY:
        raise HTTPException(503, "TIN_DEBIT_RECEIVER_UNAVAILABLE")
    payload = request.model_dump()
    try:
        existing = await node._receiver_work_by_id(request.paymentId)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
    else:
        if existing.get("kind") != "TIN_DEBIT" or existing.get("payload") != payload:
            raise HTTPException(409, "TIN_DEBIT_IDEMPOTENCY_CONFLICT")
        return {"workId":existing["id"],"status":existing["status"],"stateVersion":existing["stateVersion"]}
    sender = await node.read_onchain_tin_tip_route(request.senderTin)
    recipient = await node.read_onchain_tin_tip_route(request.recipientTin)
    if not sender or not recipient or request.senderTin == request.recipientTin:
        raise HTTPException(422, "TIN_DEBIT_ROUTES_UNAVAILABLE")
    context = await read_debit_context(node, request.tokenMintAddress)
    if request.deploymentCommitment != context["deploymentCommitment"]:
        raise HTTPException(409, "TIN_DEBIT_DEPLOYMENT_CHANGED")
    try:
        bound = commitments(sender_route=sender, recipient_route=recipient, token_id=context["asset"]["tokenId"],
            amount=int(request.amountBaseUnits), nonce=int(request.nonce), amount_blinding=int(request.amountBlinding),
            deployment=int(request.deploymentCommitment, 16), valid_after_slot=int(request.validAfterSlot), expires_at_slot=int(request.expiresAtSlot))
        verify_approval(payload["approval"], sender["ownerPubkeyHash"], bound["authorizationCommitment"])
        unsigned = {name: value for name, value in payload["senderOpening"].items() if name not in ("ownerPublicKey", "signature")}
        opening_message(unsigned)
        # Full opening verification uses the authenticated head under the worker's
        # shared-root lease. Ingress binds both signatures to the same owner now.
        public = bytes.fromhex(payload["senderOpening"]["ownerPublicKey"])
        if hashlib.sha256(public).hexdigest() != sender["ownerPubkeyHash"]:
            raise ValueError()
        VerifyKey(public).verify(opening_message(unsigned), bytes.fromhex(payload["senderOpening"]["signature"]))
        if (payload["senderOpening"]["authorizationCommitment"] != format(bound["authorizationCommitment"], "064x")
            or payload["senderOpening"]["routeKeyCommitment"] != sender["gpruElgamalKeyCommitment"]):
            raise ValueError()
    except (KeyError, TypeError, ValueError, BadSignatureError) as exc:
        raise HTTPException(422, "TIN_DEBIT_OWNER_AUTHORIZATION_INVALID") from exc
    # Receiver idempotency returns the existing exact body. For a new expired
    # action the worker refuses execution; ingress alone never authorizes value.
    async with httpx.AsyncClient(timeout=30) as client:
        response = await node.receiver_request(client, "POST", "/api/work", headers={"x-api-key": node.TSN_RECEIVER_NODE_API_KEY},
            json={"id": request.paymentId, "kind": "TIN_DEBIT", "payload": payload})
    if response.is_error:
        raise HTTPException(response.status_code, "TIN_DEBIT_INGRESS_REFUSED_CHECK_SAME_WORK")
    value = response.json()
    return {"workId": value["id"], "status": value["status"], "stateVersion": value["stateVersion"]}
