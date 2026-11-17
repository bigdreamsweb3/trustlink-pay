"""validate_snapshot implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from settlement.funding.funding_contract import MAX_LEAVES
from settlement.witness.sparse_tree import SparseTree
from settlement.witness.field import field
from settlement.witness.field_hex import field_hex

def validate_snapshot(snapshot: Any, root: str, count: int) -> list[int]:
    if (not isinstance(snapshot, dict) or set(snapshot) != {"version", "leaves"}
            or type(snapshot.get("version")) is not int or snapshot["version"] != 1
            or not isinstance(snapshot["leaves"], list)):
        raise ValueError("TCAP funding snapshot has an unsupported field set")
    leaves = [field(v) for v in snapshot["leaves"]]
    if len(leaves) != count or count > MAX_LEAVES or any(v == 0 for v in leaves):
        raise ValueError("TCAP funding snapshot count or leaves are invalid")
    if SparseTree(32, dict(enumerate(leaves))).root != field_hex(root):
        raise ValueError("TCAP funding snapshot does not match the chain-selected root")
    return leaves
