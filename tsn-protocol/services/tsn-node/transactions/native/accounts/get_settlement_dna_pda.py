"""get_settlement_dna_pda: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    find_tsn_pda: Callable[..., Any]
    get_mother_escrow_pda: Callable[..., Any]


def get_settlement_dna_pda(node: Dependencies, slot: bytes) -> Pubkey:
    """Derive the Mother-rooted, one-time settlement DNA account.

    The Node only distributes this opaque address; the Mother authority must
    materialize it with ``tsn_create_settlement_dna`` before settlement.
    """
    return node.find_tsn_pda(
        b"tsn_settlement_dna",
        bytes(node.get_mother_escrow_pda()),
        slot,
    )
