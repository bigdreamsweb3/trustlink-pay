from __future__ import annotations

from app.solana_pubkey import Pubkey
from .find_tsn_pda import find_tsn_pda
from .get_cranker_pda import get_cranker_pda

def get_cranker_vault_pda(operator: Pubkey, token_mint: Pubkey) -> Pubkey:
    return find_tsn_pda(b"tsn_cranker_vault", bytes(get_cranker_pda(operator)), bytes(token_mint))
