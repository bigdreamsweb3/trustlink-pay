from __future__ import annotations

from app.solana_pubkey import Pubkey
from app import config

def get_program_pubkey() -> Pubkey:
    return Pubkey.from_string(config.TSN_PROGRAM_ID)
