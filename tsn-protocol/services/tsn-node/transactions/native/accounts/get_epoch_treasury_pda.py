"""get_epoch_treasury_pda: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
import struct
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    find_tsn_pda: Callable[..., Any]
    get_mother_escrow_pda: Callable[..., Any]


def get_epoch_treasury_pda(node: Dependencies, epoch_id: int, token_mint: Pubkey) -> Pubkey:
    return node.find_tsn_pda(b"tsn_epoch_treasury", bytes(node.get_mother_escrow_pda()), struct.pack("<Q", epoch_id), bytes(token_mint))
