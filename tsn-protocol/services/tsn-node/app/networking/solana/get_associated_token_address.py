from __future__ import annotations

from app.solana_pubkey import Pubkey
from app import config

def get_associated_token_address(owner: Pubkey, token_mint: Pubkey) -> Pubkey:
    return Pubkey.find_program_address(
        [bytes(owner), bytes(config.TOKEN_PROGRAM_ID), bytes(token_mint)],
        config.ASSOCIATED_TOKEN_PROGRAM_ID,
    )[0]
