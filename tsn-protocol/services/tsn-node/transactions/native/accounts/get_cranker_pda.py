"""get_cranker_pda: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    find_tsn_pda: Callable[..., Any]
    get_mother_escrow_pda: Callable[..., Any]


def get_cranker_pda(node: Dependencies, operator: Pubkey) -> Pubkey:
    return node.find_tsn_pda(b"tsn_cranker", bytes(node.get_mother_escrow_pda()), bytes(operator))
