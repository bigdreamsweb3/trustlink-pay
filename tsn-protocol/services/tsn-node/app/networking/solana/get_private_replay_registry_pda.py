from __future__ import annotations

from app.solana_pubkey import Pubkey
from .find_tsn_pda import find_tsn_pda
from .get_mother_escrow_pda import get_mother_escrow_pda

def get_private_replay_registry_pda() -> Pubkey:
    return find_tsn_pda(b"tsn_private_replay", bytes(get_mother_escrow_pda()))
