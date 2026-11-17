from __future__ import annotations

from app.solana_pubkey import Pubkey
from .find_tsn_pda import find_tsn_pda

def get_cranker_vault_token_pda(cranker_vault: Pubkey) -> Pubkey:
    return find_tsn_pda(b"tsn_cranker_vault_token", bytes(cranker_vault))
