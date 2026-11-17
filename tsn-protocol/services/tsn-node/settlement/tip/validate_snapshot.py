"""validate_snapshot implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from settlement.tip.tip_contract import MAX_ROUTES
from settlement.witness.sparse_tree import SparseTree
from settlement.witness.field import field
from settlement.witness.hex_field import hex_field

def validate_snapshot(snapshot: dict, root: str) -> list[int]:
    if set(snapshot) != {"version", "leaves"} or snapshot["version"] != 1 or not isinstance(snapshot["leaves"], list):
        raise ValueError("TIP snapshot schema is invalid")
    leaves = [field(value) for value in snapshot["leaves"]]
    if len(leaves) > MAX_ROUTES or any(leaf == 0 for leaf in leaves):
        raise ValueError("TIP snapshot exceeds the route limit or contains zero leaves")
    if hex_field(SparseTree(32, dict(enumerate(leaves))).root) != root:
        raise ValueError("TIP snapshot does not match its selected root")
    return leaves
