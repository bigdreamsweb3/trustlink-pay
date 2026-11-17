"""get_program_pubkey: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_PROGRAM_ID: Any


def get_program_pubkey(node: Dependencies) -> Pubkey:
    return Pubkey.from_string(node.TSN_PROGRAM_ID)
