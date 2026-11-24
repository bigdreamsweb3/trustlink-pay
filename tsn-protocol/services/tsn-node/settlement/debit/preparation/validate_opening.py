"""validate_opening: private preparation component; validates the canonical debit contract.

Inputs, outputs and failure predicates are defined by the typed implementation.
Dependencies are explicit imports; no service state or RPC is accessed.
"""
from __future__ import annotations
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey
from settlement.witness.hex_field import hex_field
from typing import Any
import hashlib
import re
from .contract import OPENING_FIELDS, OPENING_TAG
from .route_fields import route_fields
from .opening_message import opening_message


def validate_opening(packet: dict[str, Any], *, leg: int, args: dict[str, Any],
                     owner_commitment: str, authorization: int) -> dict[str, int]:
    if (not isinstance(packet, dict)
            or set(packet) != {*OPENING_TAG, *OPENING_FIELDS, "ownerPublicKey", "signature"}):
        raise ValueError("Transfer signed opening has an unsupported layout")
    unsigned = {name: value for name, value in packet.items() if name not in ("ownerPublicKey", "signature")}
    message = opening_message(unsigned)
    for name, length in (("ownerPublicKey", 64), ("signature", 128)):
        if not isinstance(packet[name], str) or not re.fullmatch(r"[0-9a-f]{%d}" % length, packet[name]):
            raise ValueError("Transfer opening signature encoding is malformed")
    if not isinstance(owner_commitment, str) or not re.fullmatch(r"[0-9a-f]{64}", owner_commitment):
        raise ValueError("Transfer owner registry pin is malformed")
    public = bytes.fromhex(packet["ownerPublicKey"])
    if hashlib.sha256(public).hexdigest() != owner_commitment:
        raise ValueError("Transfer opening is not from its registered owner")
    try:
        VerifyKey(public).verify(message, bytes.fromhex(packet["signature"]))
    except (BadSignatureError, ValueError) as error:
        raise ValueError("Transfer opening consent does not authenticate") from error
    if leg != 0:
        raise ValueError("Only the sender supplies an opening")
    route = args["sender_route"]
    key = hex_field(route_fields(route)[1])
    head = args["state"]["heads"].get(key)
    expected = {
        "leg": leg, "authorizationCommitment": hex_field(authorization),
        "routeKeyCommitment": route["gpruElgamalKeyCommitment"],
        "tokenId": args["token_id"], "sequence": head["sequence"] if head else "0",
        "previousMemoCommitment": head["memoCommitment"] if head else "0" * 64,
    }
    if any(packet[name] != value for name, value in expected.items()):
        raise ValueError("Transfer opening is stale or belongs to a different context")
    # Root changes may be rebased only while this authenticated sender head and
    # the signed action/asset/expiry remain identical. The opening is checked
    # against its current balance commitment by prepare_tin_debit.
    return {"balance": int(packet["balance"]), "blinding": int(packet["blinding"])}
