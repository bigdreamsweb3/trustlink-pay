from __future__ import annotations

from app.solana_pubkey import Pubkey
from .get_program_pubkey import get_program_pubkey

def find_tsn_pda(*seeds: bytes) -> Pubkey:
    return Pubkey.find_program_address(list(seeds), get_program_pubkey())[0]
