from __future__ import annotations

from app.solana_pubkey import Pubkey
from .find_tsn_pda import find_tsn_pda

def get_mother_escrow_pda() -> Pubkey:
    return find_tsn_pda(b"tsn_mother_escrow")
