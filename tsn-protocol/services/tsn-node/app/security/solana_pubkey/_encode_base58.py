from __future__ import annotations

from .constants import BASE58_ALPHABET

def _encode_base58(data: bytes) -> str:
    number = int.from_bytes(data, "big")
    encoded = ""
    while number:
        number, remainder = divmod(number, 58)
        encoded = BASE58_ALPHABET[remainder] + encoded
    leading_zeroes = len(data) - len(data.lstrip(b"\x00"))
    return (BASE58_ALPHABET[0] * leading_zeroes) + encoded
