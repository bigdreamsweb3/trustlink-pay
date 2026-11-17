"""_babyjub_mul implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from security.cryptography._babyjub_add import _babyjub_add

def _babyjub_mul(point: tuple[int, int], scalar: int) -> tuple[int, int]:
    result = (0, 1)
    base = point
    while scalar:
        if scalar & 1:
            result = _babyjub_add(result, base)
        base = _babyjub_add(base, base)
        scalar >>= 1
    return result
