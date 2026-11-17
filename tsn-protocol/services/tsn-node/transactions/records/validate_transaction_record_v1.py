"""validate_transaction_record_v1 implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from nacl.secret import SecretBox
from transactions.records._sha256_to_bn254_scalar_hex import _sha256_to_bn254_scalar_hex
import base64
import hashlib
import json

def validate_transaction_record_v1(transition: dict[str, Any]) -> None:
    document = transition.get("memoDocument")
    if not isinstance(document, dict):
        raise ValueError("DBrix transaction record document is missing")
    if document.get("version") != 1 or document.get("algorithm") != "dbrix-core-secretbox-v1":
        raise ValueError("DBrix transaction record envelope version or algorithm is unsupported")
    if "public" in document:
        raise ValueError("GPRU Memo must keep the balance action owner-encrypted")
    dna = bytes.fromhex(str(transition.get("dna") or ""))
    ephemeral = bytes.fromhex(str(transition.get("recordEphemeralPublicKey") or ""))
    if document.get("dna") != dna.hex() or document.get("recordEphemeralPublicKey") != ephemeral.hex():
        raise ValueError("DBrix envelope key context differs from the authorized GPRU transition")
    try:
        ciphertext = base64.b64decode(str(document.get("data") or ""), validate=True)
        nonce = base64.b64decode(str(document.get("nonce") or ""), validate=True)
    except (ValueError, TypeError) as exc:
        raise ValueError("DBrix transaction record ciphertext or nonce is invalid Base64") from exc
    if len(nonce) != SecretBox.NONCE_SIZE or len(ciphertext) < SecretBox.MACBYTES:
        raise ValueError("DBrix transaction record ciphertext or nonce length is invalid")
    if document.get("compression") not in (None, "deflate"):
        raise ValueError("DBrix transaction record compression method is unsupported")

    encoded = base64.urlsafe_b64encode(
        json.dumps(document, separators=(",", ":"), sort_keys=True, ensure_ascii=True).encode("utf-8"),
    ).decode("ascii").rstrip("=")
    expected_slots = [encoded[index:index + 32].ljust(32, "=") for index in range(0, len(encoded), 32)]
    expected_payload = "".join(slot.rstrip("=") for slot in expected_slots)
    if transition.get("memoLedgerSlots") != expected_slots or transition.get("memoBodyPayload") != expected_payload:
        raise ValueError("DBrix transaction record document does not match its Ledger memo encoding")
    proof = transition.get("proof")
    public_inputs = proof.get("publicInputs") if isinstance(proof, dict) else None
    if not isinstance(public_inputs, list) or len(public_inputs) != 13:
        raise ValueError("GPRU transaction record requires exactly thirteen public hidden-head inputs")
    try:
        successor_root, balance_x, balance_y, action_commitment = (
            str(public_inputs[index]).removeprefix("0x").lower() for index in (6, 7, 8, 3)
        )
    except (IndexError, TypeError) as exc:
        raise ValueError("GPRU public hidden-head inputs are malformed") from exc
    encrypted_delta, ephemeral_x, ephemeral_y = (
        str(public_inputs[index]).removeprefix("0x").lower() for index in (9, 10, 11)
    )
    prefix = f"TSN_GPRU_HEAD_V1:{successor_root}:{balance_x}:{balance_y}:{action_commitment}:{encrypted_delta}:{ephemeral_x}:{ephemeral_y}:"
    expected_memo_payload = prefix + expected_payload
    if transition.get("memoPayload") != expected_memo_payload:
        raise ValueError("DBrix Memo prefix does not match the proof-bound successor state")
    memo_digest = hashlib.sha256(expected_memo_payload.encode("ascii")).digest()
    expected_commitment = memo_digest.hex()
    if transition.get("memoCommitment") != expected_commitment:
        raise ValueError("DBrix transaction record commitment does not match the Ledger memo")
    expected_field_commitment = _sha256_to_bn254_scalar_hex(expected_memo_payload.encode("ascii"))
    if str(public_inputs[2]).removeprefix("0x").lower() != expected_field_commitment:
        raise ValueError("Groth16 Memo field input does not match the canonical Memo hash")
