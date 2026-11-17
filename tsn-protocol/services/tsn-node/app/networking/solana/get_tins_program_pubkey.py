from __future__ import annotations

from app.solana_pubkey import Pubkey
from app import config

def get_tins_program_pubkey() -> Pubkey:
    return Pubkey.from_string(config.TINS_PROGRAM_ID)
