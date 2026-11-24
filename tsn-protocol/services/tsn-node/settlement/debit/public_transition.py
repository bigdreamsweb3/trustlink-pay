"""Exact debit execution projection. Private openings are rejected."""
from .contract import TRANSITION_FIELDS


def public_debit_transition(value: dict) -> dict:
    if not isinstance(value, dict) or set(value) != set(TRANSITION_FIELDS):
        raise ValueError("TIN_DEBIT_EXECUTION_FIELD_SET_INVALID")
    proof = value.get("proof")
    if not isinstance(proof, dict) or set(proof) != {"publicInputs", "proofA", "proofB", "proofC"}:
        raise ValueError("TIN_DEBIT_EXECUTION_PROOF_FIELD_SET_INVALID")
    return dict(value)
