"""extend_snapshot implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from settlement.witness.sparse_tree import SparseTree
from settlement.witness.field import field
from settlement.witness.field_hex import field_hex

def extend_snapshot(snapshot: dict, base_root: str, leaves: list[int], chain_root: str, count: int) -> dict:
    if set(snapshot) != {"version", "leaves"} or snapshot["version"] != 1 or not isinstance(snapshot["leaves"], list):
        raise ValueError("TIP snapshot schema is invalid")
    previous = [field(value) for value in snapshot["leaves"]]
    if any(value == 0 for value in previous + leaves):
        raise ValueError("TIP ordered leaves must be nonzero")
    if SparseTree(32, dict(enumerate(previous))).root != field_hex(base_root):
        raise ValueError("Base TIP snapshot does not match its root")
    combined = previous + leaves
    if len(combined) != count or SparseTree(32, dict(enumerate(combined))).root != field_hex(chain_root):
        raise ValueError("Extended TIP snapshot does not match the confirmed chain root and count")
    return {"version": 1, "leaves": [str(value) for value in combined]}
