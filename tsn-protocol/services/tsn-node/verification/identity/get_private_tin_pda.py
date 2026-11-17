"""get_private_tin_pda: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
import hashlib
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TINS_LOOKUP_SECRET: Any
    get_tins_program_pubkey: Callable[..., Any]


def get_private_tin_pda(node: Dependencies, tin: str) -> Pubkey:
    if len(node.TINS_LOOKUP_SECRET.encode("utf-8")) < 16:
        raise ValueError("TINS_LOOKUP_SECRET must contain at least 16 bytes")
    lookup_commitment = hashlib.sha256(
        b"TSN_TIN_V1_LOOKUP" + node.TINS_LOOKUP_SECRET.encode("utf-8") + str(tin).encode("utf-8")
    ).digest()
    return Pubkey.find_program_address([b"tin-v1", lookup_commitment], node.get_tins_program_pubkey())[0]
