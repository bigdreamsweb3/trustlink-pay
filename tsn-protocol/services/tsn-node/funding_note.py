"""Private funding openings and public, amount-bound TCAP leaves.

Only the note commitment crosses the wallet/chain boundary. The funded leaf
is constructed by TCAP from that commitment and the actual registered deposit.
"""
from __future__ import annotations

from typing import Any

from gpru_crypto import poseidon_v1
from hidden_head_witness import field_hex, hex_field

NOTE_DOMAIN = 1880519585075378862971854540099064911735248433
FUNDED_LEAF_DOMAIN = 7345779629200698683464734587914033020491313
NULLIFIER_DOMAIN = 2067653150050877929286087838257825941301032058674988668465


def validate_funding_note(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != {"version", "secret", "blinding", "commitment"}:
        raise ValueError("Funding note has an unsupported field set")
    if type(value["version"]) is not int or value["version"] != 1:
        raise ValueError("Funding note version is unsupported")
    secret = field_hex(value["secret"])
    blinding = field_hex(value["blinding"])
    commitment = field_hex(value["commitment"])
    if secret == 0 or commitment == 0:
        raise ValueError("Funding note secret and commitment must be nonzero")
    if poseidon_v1([NOTE_DOMAIN, secret, blinding]) != commitment:
        raise ValueError("Funding note opening does not match its commitment")
    return dict(value)


def funding_nullifier(note: dict[str, Any]) -> str:
    checked = validate_funding_note(note)
    result = poseidon_v1([NULLIFIER_DOMAIN, field_hex(checked["secret"])])
    if result == 0:
        raise ValueError("Funding note produces a zero nullifier")
    return hex_field(result)


def funded_leaf(commitment: str, token_id: int, amount: int) -> int:
    if (type(token_id) is not int or not 0 < token_id <= 0xFFFFFFFF
            or type(amount) is not int or not 0 < amount <= 0xFFFFFFFFFFFFFFFF):
        raise ValueError("Funded leaf requires a positive registered u32 token and u64 amount")
    note_commitment = field_hex(commitment)
    if note_commitment == 0:
        raise ValueError("Funding note commitment must be nonzero")
    return poseidon_v1([FUNDED_LEAF_DOMAIN, note_commitment, token_id, amount])
