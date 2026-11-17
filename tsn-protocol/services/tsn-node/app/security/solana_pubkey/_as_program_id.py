from __future__ import annotations



def _as_program_id(value: "Pubkey | bytes") -> bytes:
    from .types import Pubkey
    if isinstance(value, Pubkey):
        return bytes(value)
    raw = bytes(value)
    if len(raw) != 32:
        raise ValueError("program id must contain 32 bytes")
    return raw
