"""_encrypt_memo: private preparation component; validates the canonical debit contract.

Inputs, outputs and failure predicates are defined by the typed implementation.
Dependencies are explicit imports; no service state or RPC is accessed.
"""
from __future__ import annotations
from nacl.secret import SecretBox
from security.cryptography.derive_node_record_shared_point import derive_node_record_shared_point
from transactions.records._sha256_to_bn254_scalar_hex import _sha256_to_bn254_scalar_hex
from typing import Any
import base64
import hashlib
import secrets
from ._route_record_key import _route_record_key


def _encrypt_memo(*, leg: int, args: dict[str, Any], prepared: dict[str, Any]) -> dict[str, str]:
    route = args["sender_route" if leg == 0 else "recipient_route"]
    witness = prepared["witness"]
    ephemeral, shared = derive_node_record_shared_point(_route_record_key(route))
    record = bytearray([1, leg])
    record.extend((witness["sequences"][leg] + 1).to_bytes(8, "little"))
    record.extend(witness["priorMemos"][leg].to_bytes(32, "big"))
    record.extend(args["token_id"].to_bytes(4, "little"))
    record.extend(args["amount"].to_bytes(8, "little"))
    record.extend(args["amount_blinding"].to_bytes(32, "big"))
    dna = secrets.token_bytes(32)
    key = hashlib.sha256(b"DBRIX_GPRU_TRANSACTION_RECORD_KEY_V1\0" + shared + dna + ephemeral).digest()
    nonce = secrets.token_bytes(SecretBox.NONCE_SIZE)
    ciphertext = SecretBox(key).encrypt(bytes(record), nonce).ciphertext
    record[:] = bytes(len(record))
    fields = ("successorPortfolioRoots", "successorBalanceX", "successorBalanceY")
    binary = bytes([1, leg]) + b"".join(witness[name][leg].to_bytes(32, "big") for name in fields)
    binary += witness["actionCommitment"].to_bytes(32, "big")
    binary += b"".join(witness[name][leg].to_bytes(32, "big") for name in
                       ("encryptedBlindingDeltas", "deltaEphemeralPublicX", "deltaEphemeralPublicY"))
    binary += dna + ephemeral + nonce + ciphertext
    if len(binary) != 416:
        raise ValueError("TIN-Debit owner record has an invalid length")
    payload = "TSN_GPRU_TIN_DEBIT_MEMO_V1:" + base64.urlsafe_b64encode(binary).decode("ascii").rstrip("=")
    return {"memoPayload": payload, "memoCommitmentField": _sha256_to_bn254_scalar_hex(payload.encode("ascii"))}
