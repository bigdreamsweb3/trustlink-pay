from __future__ import annotations

from ._decode_base58 import _decode_base58

def from_string(cls, value: str) -> "Pubkey":
    raw = _decode_base58(str(value).strip())
    if len(raw) != 32:
        raise ValueError("public key must decode to 32 bytes")
    return cls(raw)
