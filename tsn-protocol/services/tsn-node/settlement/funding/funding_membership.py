"""funding_membership implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from settlement.witness.sparse_tree import SparseTree
from settlement.funding.funded_leaf import funded_leaf
from settlement.witness.hex_field import hex_field

def funding_membership(snapshot: dict[str, Any], commitment: str, token_id: int, amount: int) -> dict[str, Any]:
    leaf = funded_leaf(commitment, token_id, amount)
    leaves = snapshot["leaves"]
    if leaf not in leaves:
        raise ValueError("Confirmed deposit has no membership in the selected funding root")
    index = leaves.index(leaf)
    tree = SparseTree(32, dict(enumerate(leaves)))
    if hex_field(tree.root) != snapshot["root"]:
        raise ValueError("Funding membership snapshot root differs")
    return {"fundingRoot": tree.root, "fundingIndex": index, "fundingSiblings": tree.siblings(index)}
