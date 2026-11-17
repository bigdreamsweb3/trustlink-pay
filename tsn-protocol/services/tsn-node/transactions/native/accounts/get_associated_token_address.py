"""get_associated_token_address: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    ASSOCIATED_TOKEN_PROGRAM_ID: Any
    TOKEN_PROGRAM_ID: Any


def get_associated_token_address(node: Dependencies, owner: Pubkey, token_mint: Pubkey) -> Pubkey:
    return Pubkey.find_program_address(
        [bytes(owner), bytes(node.TOKEN_PROGRAM_ID), bytes(token_mint)],
        node.ASSOCIATED_TOKEN_PROGRAM_ID,
    )[0]
