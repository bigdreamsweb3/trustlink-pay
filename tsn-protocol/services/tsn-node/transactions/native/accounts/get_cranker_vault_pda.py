"""get_cranker_vault_pda: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    find_tsn_pda: Callable[..., Any]
    get_cranker_pda: Callable[..., Any]


def get_cranker_vault_pda(node: Dependencies, operator: Pubkey, token_mint: Pubkey) -> Pubkey:
    return node.find_tsn_pda(
        b"tsn_cranker_vault",
        bytes(node.get_cranker_pda(operator)),
        bytes(token_mint),
    )
