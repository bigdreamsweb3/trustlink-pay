"""SparseTree.siblings implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations


def siblings(self, index: int) -> list[int]:
    return [self.levels[level].get((index >> level) ^ 1, self.zeros[level]) for level in range(self.depth)]
