"""state_trees: private preparation component; validates the canonical debit contract.

Inputs, outputs and failure predicates are defined by the typed implementation.
Dependencies are explicit imports; no service state or RPC is accessed.
"""
from __future__ import annotations
from security.cryptography.poseidon_v1 import poseidon_v1
from settlement.witness._portfolio import _portfolio
from settlement.witness.sparse_tree import SparseTree
from typing import Any
from .hex_scalar import hex_scalar
from .scalar import scalar
from .uint import uint


def state_trees(state: dict[str, Any]) -> tuple[SparseTree, SparseTree, dict[int, int]]:
    if (not isinstance(state, dict) or set(state) != {"version", "heads", "nullifiers"}
            or type(state["version"]) is not int or state["version"] != 1
            or not isinstance(state["heads"], dict) or not isinstance(state["nullifiers"], list)):
        raise ValueError("Transfer TCAP snapshot has an unsupported layout")
    leaves: dict[int, int] = {}
    for key, head in state["heads"].items():
        route = hex_scalar(key, nonzero=True)
        index = route % (1 << 128)
        if index in leaves:
            raise ValueError("Transfer snapshot has colliding head indices")
        if not isinstance(head, dict) or set(head) != {"sequence", "memoCommitment", "actionCommitment", "portfolio"}:
            raise ValueError("Transfer predecessor has an unsupported layout")
        sequence = scalar(head["sequence"], nonzero=True)
        uint(sequence, 64, positive=True)
        leaves[index] = poseidon_v1([route, sequence, hex_scalar(head["memoCommitment"], nonzero=True),
                                   hex_scalar(head["actionCommitment"], nonzero=True), _portfolio(head["portfolio"]).root])
    spent: dict[int, int] = {}
    for value in state["nullifiers"]:
        nullifier = hex_scalar(value, nonzero=True)
        key = poseidon_v1([nullifier])
        index = key % (1 << 128)
        if index in spent:
            raise ValueError("Transfer snapshot has duplicate or colliding nullifiers")
        spent[index] = key
    return SparseTree(128, leaves), SparseTree(128, spent), leaves
