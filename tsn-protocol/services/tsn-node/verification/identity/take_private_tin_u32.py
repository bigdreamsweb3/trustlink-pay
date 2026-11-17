"""Decode one little-endian u32 through a bounded byte-reader port."""
from collections.abc import Callable
def take_private_tin_u32(take: Callable[[int, str], bytes], label: str) -> int:
    return int.from_bytes(take(4, label), "little")
