"""funded_leaf implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from settlement.funding.note_contract import FUNDED_LEAF_DOMAIN
from settlement.witness.field_hex import field_hex
from security.cryptography.poseidon_v1 import poseidon_v1

def funded_leaf(commitment: str, token_id: int, amount: int) -> int:
    if (type(token_id) is not int or not 0 < token_id <= 0xFFFFFFFF
            or type(amount) is not int or not 0 < amount <= 0xFFFFFFFFFFFFFFFF):
        raise ValueError("Funded leaf requires a positive registered u32 token and u64 amount")
    note_commitment = field_hex(commitment)
    if note_commitment == 0:
        raise ValueError("Funding note commitment must be nonzero")
    return poseidon_v1([FUNDED_LEAF_DOMAIN, note_commitment, token_id, amount])
