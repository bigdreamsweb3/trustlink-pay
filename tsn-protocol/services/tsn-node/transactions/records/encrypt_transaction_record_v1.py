"""encrypt_transaction_record_v1 implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from transactions.records.record_contract import BN254_SCALAR_MODULUS
from nacl.secret import SecretBox
from transactions.records._ledger_memo_payload_v1 import _ledger_memo_payload_v1
from transactions.records._sha256_to_bn254_scalar_hex import _sha256_to_bn254_scalar_hex
from transactions.records._validate_balance_action_record_v1 import _validate_balance_action_record_v1
import base64
import hashlib
import json
import secrets
import zlib

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
