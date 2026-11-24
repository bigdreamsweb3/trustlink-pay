"""Sender-authorized, in-memory transfer preparation with an offline recipient.

The sender registry pin and root-selected snapshots are independently validated
caller inputs. Only the sender discloses an opening; recipient credit uses the
stored commitment and registered public keys, just like existing deposit credit.
"""
from __future__ import annotations

import base64
import copy
import hashlib
import json
import re
import secrets
import zlib
from typing import Any

from nacl.exceptions import BadSignatureError
from nacl.secret import SecretBox
from nacl.signing import VerifyKey

from core import (
    BABYJUB_SUBORDER, commitments, hex_field, hex_scalar, prepare_transfer,
    route_fields, scalar, uint,
)
from security.cryptography.derive_node_record_shared_point import derive_node_record_shared_point
from security.cryptography.encrypt_balance_blinding_delta_v1 import encrypt_balance_blinding_delta_v1
from transactions.records._ledger_memo_payload_v1 import _ledger_memo_payload_v1
from transactions.records._sha256_to_bn254_scalar_hex import _sha256_to_bn254_scalar_hex

OPENING_DOMAIN = b"TSN_TIN_TRANSFER_OPENING_V1\0"
OPENING_FIELDS = (
    "leg", "authorizationCommitment", "oldGlobalRoot", "tipRouteRoot", "rootSequence",
    "routeKeyCommitment", "tokenId", "sequence", "previousMemoCommitment", "balance", "blinding",
)
OPENING_TAG = {"version": 1, "recordType": "tsn-gpru-transfer-opening-v1"}


def _decimal(value: Any, bits: int, *, positive: bool = False) -> int:
    if not isinstance(value, str) or not re.fullmatch(r"0|[1-9][0-9]*", value):
        raise ValueError("Transfer opening integer encoding is not canonical")
    return uint(int(value), bits, positive=positive)


def opening_message(packet: dict[str, Any]) -> bytes:
    """Canonical domain-separated consent for this opening and this transfer."""
    if (not isinstance(packet, dict) or set(packet) != {*OPENING_TAG, *OPENING_FIELDS}
            or type(packet["version"]) is not int or packet["version"] != 1
            or packet["recordType"] != OPENING_TAG["recordType"]
            or type(packet["leg"]) is not int or packet["leg"] != 0):
        raise ValueError("Transfer opening packet has an unsupported layout")
    for name in ("authorizationCommitment", "oldGlobalRoot", "tipRouteRoot"):
        hex_scalar(packet[name], nonzero=True)
    hex_scalar(packet["previousMemoCommitment"])
    if (not isinstance(packet["routeKeyCommitment"], str)
            or not re.fullmatch(r"[0-9a-f]{64}", packet["routeKeyCommitment"])
            or int(packet["routeKeyCommitment"], 16) == 0):
        raise ValueError("Transfer opening route commitment is malformed")
    uint(packet["tokenId"], 32, positive=True)
    _decimal(packet["rootSequence"], 64)
    sequence = _decimal(packet["sequence"], 64)
    _decimal(packet["balance"], 128)
    blinding = _decimal(packet["blinding"], 252)
    if blinding >= BABYJUB_SUBORDER:
        raise ValueError("Transfer opening blinding is noncanonical")
    if (sequence == 0) != (packet["previousMemoCommitment"] == "0" * 64):
        raise ValueError("Transfer opening predecessor does not match its sequence")
    return OPENING_DOMAIN + "\n".join(str(packet[name]) for name in OPENING_FIELDS).encode("ascii")


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
        "oldGlobalRoot": args["old_root"], "tipRouteRoot": args["tip_root"],
        "rootSequence": str(args["root_sequence"]), "routeKeyCommitment": route["gpruElgamalKeyCommitment"],
        "tokenId": args["token_id"], "sequence": head["sequence"] if head else "0",
        "previousMemoCommitment": head["memoCommitment"] if head else "0" * 64,
    }
    if any(packet[name] != value for name, value in expected.items()):
        raise ValueError("Transfer opening is stale or belongs to a different context")
    return {"balance": int(packet["balance"]), "blinding": int(packet["blinding"])}


def _route_record_key(route: dict[str, Any]) -> bytes:
    public = route.get("gpruElgamalPublicKey")
    if not isinstance(public, str) or not re.fullmatch(r"[0-9a-f]{64}", public):
        raise ValueError("Transfer requires the registered owner record public key")
    key = bytes.fromhex(public)
    expected = hashlib.sha256(b"TSN_GPRU_ELGAMAL_KEY_COMMITMENT_V1\0" + b"\x01" + key).hexdigest()
    if expected != route["gpruElgamalKeyCommitment"]:
        raise ValueError("Transfer owner record key does not match its authenticated route")
    return key


def _encrypt_memo(*, leg: int, args: dict[str, Any], prepared: dict[str, Any]) -> dict[str, str]:
    route = args["sender_route" if leg == 0 else "recipient_route"]
    witness = prepared["witness"]
    ephemeral, shared = derive_node_record_shared_point(_route_record_key(route))
    cipher = encrypt_balance_blinding_delta_v1(
        scan_public_key_x=bytes.fromhex(route["gpruBalanceScanPublicKeyX"]),
        scan_public_key_y=bytes.fromhex(route["gpruBalanceScanPublicKeyY"]),
        blinding_delta=witness["blindingDeltas"][leg],
    )
    record = {
        "version": 1, "recordType": "tsn-gpru-transfer-action-v1", "actionKind": 4, "leg": leg,
        "sequence": str(witness["sequences"][leg] + 1),
        "previousMemoCommitment": hex_field(witness["priorMemos"][leg]),
        "actionCommitment": hex_field(witness["actionCommitment"]),
        "authorizationCommitment": hex_field(witness["authorizationCommitment"]),
        "nullifier": hex_field(witness["nullifier"]), "tokenId": args["token_id"],
        "amountBaseUnits": str(args["amount"]), "amountCommitment": hex_field(witness["amountCommitment"]),
        "amountBlinding": str(args["amount_blinding"]),
    }
    dna = secrets.token_bytes(32)
    key = hashlib.sha256(b"DBRIX_GPRU_TRANSACTION_RECORD_KEY_V1\0" + shared + dna + ephemeral).digest()
    plaintext = b"\x02" + json.dumps(record, separators=(",", ":"), sort_keys=True).encode("ascii")
    compressed = zlib.compress(plaintext, level=9)
    compression = len(compressed) < len(plaintext)
    nonce = secrets.token_bytes(SecretBox.NONCE_SIZE)
    ciphertext = SecretBox(key).encrypt(compressed if compression else plaintext, nonce).ciphertext
    envelope = {
        "version": 1, "algorithm": "dbrix-core-secretbox-v1", "dna": dna.hex(),
        "recordEphemeralPublicKey": ephemeral.hex(), "data": base64.b64encode(ciphertext).decode("ascii"),
        "nonce": base64.b64encode(nonce).decode("ascii"),
    }
    if compression:
        envelope["compression"] = "deflate"
    document = json.dumps(envelope, separators=(",", ":"), sort_keys=True).encode("ascii")
    _, ledger = _ledger_memo_payload_v1(document)
    fields = [leg, hex_field(witness["successorPortfolioRoots"][leg]),
              hex_field(witness["successorBalanceX"][leg]), hex_field(witness["successorBalanceY"][leg]),
              hex_field(witness["actionCommitment"]), hex_field(cipher["encryptedDelta"]),
              hex_field(cipher["ephemeralPublicX"]), hex_field(cipher["ephemeralPublicY"]), ledger]
    payload = "TSN_GPRU_TRANSFER_HEAD_V1:" + ":".join(str(value) for value in fields)
    return {"memoPayload": payload, "memoCommitmentField": _sha256_to_bn254_scalar_hex(payload.encode("ascii"))}


def prepare_sender_transfer(*, args: dict[str, Any], sender_opening_packet: dict[str, Any]) -> dict[str, Any]:
    """Validate sender disclosure, encrypt both records, and build one witness.

    No provisional candidate is persisted or accepted. Callers must verify the
    exact Groth16 statement; the recipient can recover its encrypted record later.
    """
    if (not isinstance(args, dict) or any(name in args for name in
            ("sender_opening", "recipient_opening", "memo_commitments"))):
        raise ValueError("Sender preparation does not accept unsigned openings or supplied Memos")
    working = copy.deepcopy(args)
    bound = commitments(**{name: working[name] for name in (
        "sender_route", "recipient_route", "token_id", "amount", "nonce", "amount_blinding",
        "deployment", "valid_after_slot", "expires_at_slot")})
    working["sender_opening"] = validate_opening(sender_opening_packet, leg=0, args=working,
                                                owner_commitment=working["sender_owner_commitment"],
                                                authorization=bound["authorizationCommitment"])
    for route in (working["sender_route"], working["recipient_route"]):
        _route_record_key(route)
    working["memo_commitments"] = [hex_field(1), hex_field(2)]
    provisional = prepare_transfer(**working)
    # Pin the same private deltas when replacing placeholders with actual hashes.
    working["blinding_deltas"] = provisional["witness"]["blindingDeltas"]
    memos = [_encrypt_memo(leg=leg, args=working, prepared=provisional) for leg in range(2)]
    working["memo_commitments"] = [memo["memoCommitmentField"] for memo in memos]
    result = prepare_transfer(**working)
    result["ownerMemos"] = [memo["memoPayload"] for memo in memos]
    return result
