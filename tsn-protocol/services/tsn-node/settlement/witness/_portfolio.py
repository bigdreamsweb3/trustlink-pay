"""_portfolio implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from settlement.witness.sparse_tree import SparseTree
from settlement.witness._point import _point
from security.cryptography.poseidon_v1 import poseidon_v1
import re

def _portfolio(value: Any) -> SparseTree:
    if not isinstance(value, dict):
        raise ValueError("Hidden-head portfolio must be an object")
    leaves = {}
    for token, point in value.items():
        if not re.fullmatch(r"[1-9][0-9]*", token) or not 0 < int(token) <= 0xFFFFFFFF:
            raise ValueError("Hidden-head portfolio token must be a positive u32")
        x, y = _point(point)
        leaves[int(token)] = poseidon_v1([int(token), x, y])
    return SparseTree(32, leaves)
