"""find_tsn_pda: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    get_program_pubkey: Callable[..., Any]


def find_tsn_pda(node: Dependencies, *seeds: bytes) -> Pubkey:
    return Pubkey.find_program_address(list(seeds), node.get_program_pubkey())[0]
