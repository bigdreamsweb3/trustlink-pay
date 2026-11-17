"""path_root implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from security.cryptography.poseidon_v1 import poseidon_v1

def path_root(leaf: int, index: int, siblings: list[int]) -> int:
    node = leaf
    for level, sibling in enumerate(siblings):
        node = poseidon_v1([sibling, node] if (index >> level) & 1 else [node, sibling])
    return node
