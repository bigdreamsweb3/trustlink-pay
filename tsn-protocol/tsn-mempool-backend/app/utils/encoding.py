from __future__ import annotations

import base64
import binascii
import json
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import HTTPException

from app import config


def ui_amount_to_base_units(value: Any, decimals: int) -> int:
    try:
        amount = Decimal(str(value))
        scaled = amount * (Decimal(10) ** decimals)
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise HTTPException(422, "Intent amount is invalid") from exc
    if amount <= 0 or scaled != scaled.to_integral_value():
        raise HTTPException(422, "Intent amount has invalid token precision")
    result = int(scaled)
    if result > 0xFFFF_FFFF_FFFF_FFFF:
        raise HTTPException(422, "Intent amount is outside the u64 range")
    return result


def encode_base58(data: bytes) -> str:
    value = int.from_bytes(data, "big")
    encoded = ""
    while value:
        value, remainder = divmod(value, 58)
        encoded = config.BASE58_ALPHABET[remainder] + encoded
    leading_zeroes = len(data) - len(data.lstrip(b"\0"))
    return (config.BASE58_ALPHABET[0] * leading_zeroes) + (encoded or config.BASE58_ALPHABET[0])


def decode_base58(value: str) -> bytes:
    number = 0
    for character in value:
        try:
            digit = config.BASE58_ALPHABET.index(character)
        except ValueError as exc:
            raise ValueError("Invalid base58 value") from exc
        number = number * 58 + digit
    decoded = number.to_bytes((number.bit_length() + 7) // 8, "big") if number else b""
    leading_zeroes = len(value) - len(value.lstrip(config.BASE58_ALPHABET[0]))
    return (b"\0" * leading_zeroes) + decoded


def decode_secret_key(value: str, expected_lengths: set[int], label: str) -> bytes:
    normalized = value.strip()
    if not normalized:
        raise RuntimeError(f"{label} is required")
    try:
        if normalized.startswith("["):
            decoded = bytes(json.loads(normalized))
        elif all(character in "0123456789abcdefABCDEF" for character in normalized) and len(normalized) % 2 == 0:
            decoded = bytes.fromhex(normalized)
        else:
            decoded = base64.b64decode(normalized, validate=True)
    except (ValueError, TypeError, json.JSONDecodeError, binascii.Error) as exc:
        raise RuntimeError(f"{label} is invalid") from exc
    if len(decoded) not in expected_lengths:
        expected = " or ".join(str(length) for length in sorted(expected_lengths))
        raise RuntimeError(f"{label} must contain {expected} bytes")
    return decoded
