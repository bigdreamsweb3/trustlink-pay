"""private_settlement_commitment: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
import hashlib
import struct
from typing import Any, Callable, Protocol



def private_settlement_commitment(
    epoch_treasury: Pubkey, epoch_ledger: Pubkey, slot: bytes, commitment_digest: bytes,
    random_nonce: bytes, cranker_vault: Pubkey, recipient_wallet: Pubkey,
    token_mint: Pubkey, payout_amount: int, payout_nullifier: bytes,
    lease_id_hash_value: bytes, lease_version: int, lease_expiry_ts: int,
    expires_at_ts: int,
) -> bytes:
    return hashlib.sha256(b"TSN_SETTLEMENT_COMMITMENT_V2" + bytes(epoch_treasury)
        + bytes(epoch_ledger) + slot + commitment_digest + random_nonce + payout_nullifier + bytes(cranker_vault)
        + bytes(recipient_wallet) + bytes(token_mint) + struct.pack("<Q", payout_amount)
        + struct.pack("<Q", 0) + lease_id_hash_value + struct.pack("<Q", lease_version)
        + struct.pack("<q", lease_expiry_ts) + struct.pack("<q", expires_at_ts)).digest()
