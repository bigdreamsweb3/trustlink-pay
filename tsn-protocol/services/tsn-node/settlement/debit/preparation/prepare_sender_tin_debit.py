"""prepare_sender_tin_debit: private preparation component; validates the canonical debit contract.

Inputs, outputs and failure predicates are defined by the typed implementation.
Dependencies are explicit imports; no service state or RPC is accessed.
"""
from __future__ import annotations
from settlement.witness.hex_field import hex_field
from typing import Any
import copy
from .commitments import commitments
from .prepare_tin_debit import prepare_tin_debit
from ._encrypt_memo import _encrypt_memo
from ._route_record_key import _route_record_key
from .validate_opening import validate_opening


def prepare_sender_tin_debit(*, args: dict[str, Any], sender_opening_packet: dict[str, Any]) -> dict[str, Any]:
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
    provisional = prepare_tin_debit(**working)
    # Pin the same private deltas when replacing placeholders with actual hashes.
    working["blinding_deltas"] = provisional["witness"]["blindingDeltas"]
    cipher_fields = {"encryptedDelta": "encryptedBlindingDeltas", "ephemeralPublicX": "deltaEphemeralPublicX",
                     "ephemeralPublicY": "deltaEphemeralPublicY", "ephemeralScalar": "deltaEphemeralScalars",
                     "sharedXReduction": "sharedXReductions", "sharedXCarry": "sharedXCarries",
                     "encryptedDeltaCarry": "encryptedDeltaCarries"}
    working["delta_ciphers"] = [{name: provisional["witness"][field][leg] for name, field in cipher_fields.items()}
                                for leg in range(2)]
    memos = [_encrypt_memo(leg=leg, args=working, prepared=provisional) for leg in range(2)]
    working["memo_commitments"] = [memo["memoCommitmentField"] for memo in memos]
    result = prepare_tin_debit(**working)
    result["ownerMemos"] = [memo["memoPayload"] for memo in memos]
    return result
