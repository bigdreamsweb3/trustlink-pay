"""decode_base58: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    BASE58_ALPHABET: Any


def decode_base58(node: Dependencies, value: str) -> bytes:
    number = 0
    for character in value:
        try:
            digit = node.BASE58_ALPHABET.index(character)
        except ValueError as exc:
            raise ValueError("Invalid base58 value") from exc
        number = number * 58 + digit
    decoded = number.to_bytes((number.bit_length() + 7) // 8, "big") if number else b""
    leading_zeroes = len(value) - len(value.lstrip(node.BASE58_ALPHABET[0]))
    return (b"\0" * leading_zeroes) + decoded
