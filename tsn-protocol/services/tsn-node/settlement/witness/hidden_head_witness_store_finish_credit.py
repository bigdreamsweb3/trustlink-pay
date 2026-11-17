"""HiddenHeadWitnessStore.finish_credit implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from settlement.witness.field_hex import field_hex
from settlement.witness.hex_field import hex_field
from settlement.witness.path_root import path_root
from security.cryptography.poseidon_v1 import poseidon_v1

def finish_credit(self, prepared: dict[str, Any], memo_field: str) -> None:
    witness = prepared["witness"]
    witness["memoCommitment"] = field_hex(memo_field)
    key = witness["accountPathKey"]
    next_leaf = poseidon_v1([key, witness["priorSequence"] + 1, witness["memoCommitment"], witness["actionCommitment"], witness["successorPortfolioRoot"]])
    next_head_root = path_root(next_leaf, key, witness["accountSiblings"])
    nullifier_key = poseidon_v1([witness["nullifier"]])
    next_nullifier_root = path_root(nullifier_key, nullifier_key, witness["nullifierSiblings"])
    witness["newGlobalRoot"] = poseidon_v1([next_head_root, next_nullifier_root])
    if witness["newGlobalRoot"] == witness["oldGlobalRoot"]:
        raise ValueError("TCAP successor must change the shared root")
    state = prepared["state"]
    prior = state["heads"].get(hex_field(key), {}).get("portfolio", {})
    state["heads"][hex_field(key)] = {
        "sequence": str(witness["priorSequence"] + 1), "memoCommitment": memo_field,
        "actionCommitment": hex_field(witness["actionCommitment"]),
        "portfolio": {**prior, str(witness["assetId"]): {"x": str(witness["successorBalanceX"]), "y": str(witness["successorBalanceY"])}},
    }
    state["nullifiers"].append(hex_field(witness["nullifier"]))
