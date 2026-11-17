from __future__ import annotations

from app.solana_pubkey import Pubkey
from .find_tsn_pda import find_tsn_pda
from .get_mother_escrow_pda import get_mother_escrow_pda

def get_cranker_pda(operator: Pubkey) -> Pubkey:
    return find_tsn_pda(b"tsn_cranker", bytes(get_mother_escrow_pda()), bytes(operator))
