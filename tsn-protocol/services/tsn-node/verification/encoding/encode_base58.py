"""encode_base58: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    BASE58_ALPHABET: Any


def encode_base58(node: Dependencies, data: bytes) -> str:
    value = int.from_bytes(data, "big")
    encoded = ""
    while value:
        value, remainder = divmod(value, 58)
        encoded = node.BASE58_ALPHABET[remainder] + encoded
    leading_zeroes = len(data) - len(data.lstrip(b"\0"))
    return (node.BASE58_ALPHABET[0] * leading_zeroes) + (encoded or node.BASE58_ALPHABET[0])
