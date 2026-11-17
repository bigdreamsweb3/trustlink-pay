"""SparseTree.__init__ implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from settlement.witness.field import field
from security.cryptography.poseidon_v1 import poseidon_v1

def __init__(self, depth: int, leaves: dict[int, int]):
    self.depth = depth
    self.zeros = [0]
    for _ in range(depth):
        self.zeros.append(poseidon_v1([self.zeros[-1], self.zeros[-1]]))
    if any(type(k) is not int or not 0 <= k < 1 << depth for k in leaves):
        raise ValueError("Hidden-head sparse index is out of range")
    self.levels = [{k: field(v) for k, v in leaves.items() if v}]
    for level in range(depth):
        nodes = self.levels[-1]
        parents = {}
        for parent in {index >> 1 for index in nodes}:
            digest = poseidon_v1([
                nodes.get(parent * 2, self.zeros[level]),
                nodes.get(parent * 2 + 1, self.zeros[level]),
            ])
            if digest != self.zeros[level + 1]:
                parents[parent] = digest
        self.levels.append(parents)
    self.root = self.levels[-1].get(0, self.zeros[-1])
