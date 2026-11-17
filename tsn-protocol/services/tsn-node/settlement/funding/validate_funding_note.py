"""validate_funding_note implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from settlement.funding.note_contract import NOTE_DOMAIN
from settlement.witness.field_hex import field_hex
from security.cryptography.poseidon_v1 import poseidon_v1

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
