"""hex_field implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from settlement.witness.field import field

def hex_field(value: int) -> str:
    return field(value).to_bytes(32, "big").hex()
