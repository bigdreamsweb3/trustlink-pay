from __future__ import annotations

from .constants import BASE58_ALPHABET

def _decode_base58(value: str) -> bytes:
    if not value:
        raise ValueError("public key is empty")

    number = 0
    for character in value:
        try:
            number = number * 58 + BASE58_ALPHABET.index(character)
        except ValueError as exc:
            raise ValueError("invalid base58 public key") from exc

    decoded = number.to_bytes((number.bit_length() + 7) // 8, "big") if number else b""
    leading_zeroes = len(value) - len(value.lstrip(BASE58_ALPHABET[0]))
    return (b"\x00" * leading_zeroes) + decoded
