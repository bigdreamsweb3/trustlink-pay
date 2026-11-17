"""derive_claim_slot: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
import hashlib
import hmac
import struct
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_NODE_CLAIM_SLOT_HMAC_SECRET: Any


def derive_claim_slot(node: Dependencies, payment_id_hash: bytes, amount: int, token_mint: Pubkey, epoch_id: int, commitment_digest: bytes) -> bytes:
    if not node.TSN_NODE_CLAIM_SLOT_HMAC_SECRET:
        raise RuntimeError("TSN_NODE_CLAIM_SLOT_HMAC_SECRET is required")
    return hmac.new(node.TSN_NODE_CLAIM_SLOT_HMAC_SECRET.encode("utf-8"), b"TSN_EPOCH_CLAIM_SLOT_V1" + payment_id_hash + struct.pack("<Q", amount) + bytes(token_mint) + struct.pack("<Q", epoch_id) + commitment_digest, hashlib.sha256).digest()
