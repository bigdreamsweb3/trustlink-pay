"""_validate_balance_action_record_v1 implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from transactions.records.record_contract import ACTION_KINDS
from typing import Any
from transactions.records.record_contract import BN254_SCALAR_MODULUS
from transactions.records.record_contract import ZERO_COMMITMENT

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
    from amounts.credit.commitment import commitment
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
