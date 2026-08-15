"""Small pure-Python Solana public-key and PDA adapter.

The TSN Node only needs public-key validation, byte conversion, and PDA
derivation. Keeping this adapter independent of ``solders`` lets the HTTP
node run on Wasmer's WASIX Python runtime, where native ``solders`` wheels are
not available.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Iterable

BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
PDA_MARKER = b"ProgramDerivedAddress"
MAX_SEEDS = 16
MAX_SEED_LENGTH = 32
_ED25519_P = (1 << 255) - 19
_ED25519_D = (-121665 * pow(121666, -1, _ED25519_P)) % _ED25519_P
_ED25519_SQRT_M1 = pow(2, (_ED25519_P - 1) // 4, _ED25519_P)


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


def _encode_base58(data: bytes) -> str:
    number = int.from_bytes(data, "big")
    encoded = ""
    while number:
        number, remainder = divmod(number, 58)
        encoded = BASE58_ALPHABET[remainder] + encoded
    leading_zeroes = len(data) - len(data.lstrip(b"\x00"))
    return (BASE58_ALPHABET[0] * leading_zeroes) + (encoded or BASE58_ALPHABET[0])


def _as_program_id(value: "Pubkey | bytes") -> bytes:
    if isinstance(value, Pubkey):
        return bytes(value)
    raw = bytes(value)
    if len(raw) != 32:
        raise ValueError("program id must contain 32 bytes")
    return raw


def _is_ed25519_curve_point(data: bytes) -> bool:
    """Match Solana's compressed Edwards-Y decompression check."""
    if len(data) != 32:
        return False

    encoded = int.from_bytes(data, "little")
    sign = encoded >> 255
    y = encoded & ((1 << 255) - 1)
    if y >= _ED25519_P:
        return False

    y_squared = (y * y) % _ED25519_P
    u = (y_squared - 1) % _ED25519_P
    v = (_ED25519_D * y_squared + 1) % _ED25519_P
    uv7 = (u * pow(v, 7, _ED25519_P)) % _ED25519_P
    x = (u * pow(v, 3, _ED25519_P) * pow(uv7, (_ED25519_P - 5) // 8, _ED25519_P)) % _ED25519_P

    # The compact form above computes a candidate square root. Correct it
    # with sqrt(-1) when the first candidate is the other square root.
    x_squared = (x * x) % _ED25519_P
    if (x_squared * v - u) % _ED25519_P != 0:
        x = (x * _ED25519_SQRT_M1) % _ED25519_P
        x_squared = (x * x) % _ED25519_P
    if (x_squared * v - u) % _ED25519_P != 0:
        return False
    return not (x == 0 and sign == 1)


@dataclass(frozen=True, slots=True)
class Pubkey:
    """A Solana 32-byte public key with the subset used by the TSN Node."""

    _bytes: bytes

    def __post_init__(self) -> None:
        if len(self._bytes) != 32:
            raise ValueError("public key must contain 32 bytes")
        object.__setattr__(self, "_bytes", bytes(self._bytes))

    @classmethod
    def from_string(cls, value: str) -> "Pubkey":
        raw = _decode_base58(str(value).strip())
        if len(raw) != 32:
            raise ValueError("public key must decode to 32 bytes")
        return cls(raw)

    @classmethod
    def create_program_address(
        cls,
        seeds: Iterable[bytes],
        program_id: "Pubkey | bytes",
    ) -> "Pubkey":
        seed_list = [bytes(seed) for seed in seeds]
        if len(seed_list) > MAX_SEEDS:
            raise ValueError("maximum number of PDA seeds exceeded")
        if any(len(seed) > MAX_SEED_LENGTH for seed in seed_list):
            raise ValueError("maximum PDA seed length exceeded")

        digest = hashlib.sha256(
            b"".join(seed_list) + _as_program_id(program_id) + PDA_MARKER
        ).digest()
        if _is_ed25519_curve_point(digest):
            raise ValueError("PDA lies on the ed25519 curve")
        return cls(digest)

    @classmethod
    def find_program_address(
        cls,
        seeds: Iterable[bytes],
        program_id: "Pubkey | bytes",
    ) -> tuple["Pubkey", int]:
        seed_list = [bytes(seed) for seed in seeds]
        for bump in range(255, -1, -1):
            try:
                return cls.create_program_address(seed_list + [bytes([bump])], program_id), bump
            except ValueError as exc:
                if str(exc) != "PDA lies on the ed25519 curve":
                    raise
        raise ValueError("unable to find a viable program address bump seed")

    def __bytes__(self) -> bytes:
        return self._bytes

    def __str__(self) -> str:
        return _encode_base58(self._bytes)
