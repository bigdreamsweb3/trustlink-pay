"""registry_take implementation; preserve inputs, encodings and errors."""
from __future__ import annotations


def registry_take(data: bytes, offset: list[int], length: int) -> bytes:
    if length < 0 or offset[0] + length > len(data):
        raise ValueError("TIP registry is truncated")
    result = data[offset[0]:offset[0] + length]
    offset[0] += length
    return result
