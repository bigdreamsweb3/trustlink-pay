"""DBrix-compatible encrypted GPRU balance-action records and Ledger Memos."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import zlib
from typing import Any

from nacl.secret import SecretBox

ACTION_KINDS = {1, 2, 3}  # credit, debit, exit
BABYJUB_SUBORDER = 2736030358979909402780800718157159386076813972158567259200215660948447373041
BN254_SCALAR_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617
ZERO_COMMITMENT = "0" * 64


def _sha256_to_bn254_scalar_hex(value: bytes) -> str:
    """Match GPRU's canonical big-endian SHA-256-to-BN254-field reduction."""
    return (int.from_bytes(hashlib.sha256(value).digest(), "big") % BN254_SCALAR_MODULUS).to_bytes(32, "big").hex()


def _ledger_memo_payload_v1(document: bytes) -> tuple[list[str], str]:
    encoded = base64.urlsafe_b64encode(document).decode("ascii").rstrip("=")
    slots = [encoded[index:index + 32].ljust(32, "=") for index in range(0, len(encoded), 32)]
    return slots, "".join(slot.rstrip("=") for slot in slots)


def _validate_balance_action_record_v1(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("GPRU owner balance action record must be an object")
    allowed = {
        "version", "recordType", "sequence", "previousMemoCommitment", "actionCommitment",
        "authorizationCommitment", "nullifier", "actionKind", "tokenId", "amountBaseUnits", "amountCommitment", "amountBlinding",
    }
    if set(value) != allowed:
        raise ValueError("GPRU owner balance action record has an unsupported field set")
    if type(value.get("version")) is not int or value.get("version") != 2 or value.get("recordType") != "tsn-gpru-balance-action-v2":
        raise ValueError("Unsupported GPRU owner balance action record")
    if any(isinstance(value[name], bool) for name in ("sequence", "tokenId", "actionKind", "amountBaseUnits")):
        raise ValueError("GPRU owner balance action integer values cannot be booleans")
    try:
        sequence = int(value["sequence"])
        token_id = int(value["tokenId"])
        action_kind = int(value["actionKind"])
        amount = int(value["amountBaseUnits"])
    except (TypeError, ValueError) as exc:
        raise ValueError("GPRU owner balance action values must be integers") from exc
    previous = str(value["previousMemoCommitment"])
    action_commitment = str(value["actionCommitment"])
    authorization_commitment = str(value["authorizationCommitment"])
    nullifier = str(value["nullifier"])
    if sequence <= 0 or sequence > 0xFFFFFFFFFFFFFFFF:
        raise ValueError("GPRU owner action sequence must be a positive u64")
    if token_id <= 0 or token_id > 0xFFFFFFFF:
        raise ValueError("GPRU owner action tokenId must be a positive u32")
    if action_kind not in ACTION_KINDS:
        raise ValueError("GPRU owner action kind must be credit (1), debit (2), or exit (3)")
    if amount <= 0 or amount > 0xFFFFFFFFFFFFFFFF:
        raise ValueError("GPRU owner action amount must be a positive u64")
    if len(previous) != 64 or any(char not in "0123456789abcdef" for char in previous):
        raise ValueError("GPRU previous Memo commitment must be 32-byte lowercase hex")
    for label, field in (("action commitment", action_commitment),
                         ("authorization commitment", authorization_commitment),
                         ("nullifier", nullifier)):
        if len(field) != 64 or any(char not in "0123456789abcdef" for char in field):
            raise ValueError(f"GPRU {label} must be 32-byte lowercase hex")
    if any(int(field, 16) >= BN254_SCALAR_MODULUS
           for field in (previous, action_commitment, authorization_commitment, nullifier)):
        raise ValueError("GPRU Memo, action, authorization, and nullifier values must be canonical BN254 field elements")
    if int(action_commitment, 16) == 0:
        raise ValueError("GPRU action commitment cannot be zero")
    if int(authorization_commitment, 16) == 0 or int(nullifier, 16) == 0:
        raise ValueError("GPRU action authorization commitment and nullifier must be nonzero")
    if (sequence == 1) != (previous == ZERO_COMMITMENT):
        raise ValueError("First GPRU action must have no predecessor; later actions must name one")
    from credit_amount import commitment
    blinding = str(value["amountBlinding"])
    if len(blinding) != 64 or any(c not in "0123456789abcdef" for c in blinding):
        raise ValueError("INVALID_PRIVATE_CREDIT_AMOUNT_BLINDING")
    amount_commitment = format(commitment(token_id, amount, int(blinding, 16), int(nullifier, 16)), "064x")
    if value["amountCommitment"] != amount_commitment:
        raise ValueError("PRIVATE_CREDIT_OPENING_MISMATCH")
    return {
        "version": 2,
        "recordType": "tsn-gpru-balance-action-v2",
        "amountCommitment": amount_commitment,
        "amountBlinding": blinding,
        "sequence": str(sequence),
        "previousMemoCommitment": previous,
        "actionCommitment": action_commitment,
        "authorizationCommitment": authorization_commitment,
        "nullifier": nullifier,
        "actionKind": action_kind,
        "tokenId": token_id,
        "amountBaseUnits": str(amount),
    }


def encrypt_transaction_record_v1(
    *,
    record: dict[str, Any],
    shared_point: bytes,
    record_ephemeral_public_key: bytes,
    dna: bytes,
    encrypted_blinding_delta: str,
    delta_ephemeral_public_x: str,
    delta_ephemeral_public_y: str,
    memo_binding: dict[str, str],
) -> dict[str, Any]:
    """Encrypt an owner-readable action and bind its one-time Pedersen head in the Memo."""
    if len(shared_point) != 32 or not any(shared_point):
        raise ValueError("GPRU record shared point must be a nonzero 32-byte point")
    if len(record_ephemeral_public_key) != 32 or not any(record_ephemeral_public_key):
        raise ValueError("GPRU record ephemeral public key must be a nonzero 32-byte point")
    if len(dna) != 32 or not any(dna):
        raise ValueError("GPRU DNA must be a nonzero 32-byte value")

    action = _validate_balance_action_record_v1(record)
    binding_fields = (
        "successorPortfolioRoot", "successorBalanceX", "successorBalanceY", "actionCommitment",
        "authorizationCommitment", "nullifier",
    )
    if not isinstance(memo_binding, dict) or set(memo_binding) != set(binding_fields):
        raise ValueError("GPRU Memo binding must contain exactly the successor root, point, and action commitment")
    binding = {name: str(memo_binding[name]).lower() for name in binding_fields}
    for name, value in binding.items():
        if len(value) != 64 or any(char not in "0123456789abcdef" for char in value):
            raise ValueError(f"GPRU Memo binding {name} must be 32-byte lowercase hex")
        if int(value, 16) >= BN254_SCALAR_MODULUS:
            raise ValueError(f"GPRU Memo binding {name} must be a canonical BN254 field element")
    if action["actionCommitment"] != binding["actionCommitment"]:
        raise ValueError("Owner action commitment does not match its proof-bound Memo binding")
    if action["authorizationCommitment"] != binding["authorizationCommitment"]:
        raise ValueError("Owner action authorization commitment does not match the settlement proof")
    if action["nullifier"] != binding["nullifier"]:
        raise ValueError("Owner action nullifier does not match the settlement proof")
    key = hashlib.sha256(
        b"DBRIX_GPRU_TRANSACTION_RECORD_KEY_V1\0"
        + shared_point
        + dna
        + record_ephemeral_public_key
    ).digest()
    typed_plaintext = b"\x02" + json.dumps(
        action, separators=(",", ":"), sort_keys=True, ensure_ascii=False,
    ).encode("utf-8")
    compressed = zlib.compress(typed_plaintext, level=9)
    if len(compressed) < len(typed_plaintext):
        plaintext = compressed
        compression = "deflate"
    else:
        plaintext = typed_plaintext
        compression = None

    nonce = secrets.token_bytes(SecretBox.NONCE_SIZE)
    ciphertext = SecretBox(key).encrypt(plaintext, nonce).ciphertext
    envelope: dict[str, Any] = {
        "version": 1,
        "algorithm": "dbrix-core-secretbox-v1",
        "dna": dna.hex(),
        "recordEphemeralPublicKey": record_ephemeral_public_key.hex(),
        "data": base64.b64encode(ciphertext).decode("ascii"),
        "nonce": base64.b64encode(nonce).decode("ascii"),
    }
    if compression:
        envelope["compression"] = compression

    document = json.dumps(envelope, separators=(",", ":"), sort_keys=True, ensure_ascii=True).encode("utf-8")
    slots, memo_payload = _ledger_memo_payload_v1(document)
    delta_cipher_fields = (encrypted_blinding_delta, delta_ephemeral_public_x, delta_ephemeral_public_y)
    for label, value in zip(("encrypted blinding delta", "delta ephemeral public x", "delta ephemeral public y"), delta_cipher_fields):
        if not isinstance(value, str) or len(value) != 64 or any(char not in "0123456789abcdef" for char in value):
            raise ValueError(f"GPRU {label} must be 32-byte lowercase hex")
        if int(value, 16) >= BN254_SCALAR_MODULUS:
            raise ValueError(f"GPRU {label} must be a canonical BN254 scalar")
    final_memo_payload = (
        f"TSN_GPRU_HEAD_V1:{binding['successorPortfolioRoot']}:{binding['successorBalanceX']}"
        f":{binding['successorBalanceY']}:{binding['actionCommitment']}:{encrypted_blinding_delta}"
        f":{delta_ephemeral_public_x}:{delta_ephemeral_public_y}:{memo_payload}"
    )
    memo_digest = hashlib.sha256(final_memo_payload.encode("ascii")).digest()
    return {
        "memoBodyPayload": memo_payload,
        "memoPayload": final_memo_payload,
        "memoLedgerSlots": slots,
        "memoCommitment": memo_digest.hex(),
        "memoCommitmentField": _sha256_to_bn254_scalar_hex(final_memo_payload.encode("ascii")),
        "memoDocument": envelope,
        "recordEphemeralPublicKey": record_ephemeral_public_key.hex(),
    }


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
