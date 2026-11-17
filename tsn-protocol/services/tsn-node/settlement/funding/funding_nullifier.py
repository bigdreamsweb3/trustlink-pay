"""funding_nullifier implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from settlement.funding.note_contract import NULLIFIER_DOMAIN
from settlement.witness.field_hex import field_hex
from settlement.witness.hex_field import hex_field
from security.cryptography.poseidon_v1 import poseidon_v1
from settlement.funding.validate_funding_note import validate_funding_note

def funding_nullifier(note: dict[str, Any]) -> str:
    checked = validate_funding_note(note)
    result = poseidon_v1([NULLIFIER_DOMAIN, field_hex(checked["secret"])])
    if result == 0:
        raise ValueError("Funding note produces a zero nullifier")
    return hex_field(result)
