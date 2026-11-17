"""unique_snapshot_pairs implementation; preserve inputs, encodings and errors."""
from __future__ import annotations


def unique_snapshot_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Hidden-head snapshot contains duplicate keys")
        result[key] = value
    return result
