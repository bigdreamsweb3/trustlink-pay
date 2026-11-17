"""decode_root implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from settlement.tip.tip_contract import TIP
from settlement.witness.field_hex import field_hex

def decode_root(data: bytes, tip_program: Pubkey = TIP) -> tuple[str, int]:
    root_bump = Pubkey.find_program_address([b"tip:route-merkle-root:v1"], tip_program)[1]
    if len(data) < 1066 or any(data[1066:]) or data[0] != 1 or data[1] != root_bump:
        raise ValueError("TIP route root layout is invalid")
    root, count = data[2:34].hex(), int.from_bytes(data[34:42], "little")
    if field_hex(root) == 0 or not 0 < count <= 1 << 32:
        raise ValueError("TIP route root or count is invalid")
    return root, count
