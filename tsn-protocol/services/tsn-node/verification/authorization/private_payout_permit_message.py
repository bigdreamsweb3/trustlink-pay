"""private_payout_permit_message: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
import struct
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    PRIVATE_PAYOUT_DOMAIN: Any
    get_mother_escrow_pda: Callable[..., Any]
    get_program_pubkey: Callable[..., Any]


def private_payout_permit_message(node: Dependencies,
    operator: Pubkey,
    epoch_treasury: Pubkey,
    epoch_ledger: Pubkey,
    claim_slot: Pubkey,
    slot: bytes,
    payout_nullifier: bytes,
    commitment_digest: bytes,
    random_nonce: bytes,
    settlement_commitment: bytes,
    cranker_vault: Pubkey,
    recipient_wallet: Pubkey,
    token_mint: Pubkey,
    payout_amount: int,
    claim_fee_amount: int,
    lease_id_hash_value: bytes,
    lease_version: int,
    lease_expiry_ts: int,
    expires_at_ts: int,
) -> bytes:
    return b"".join(
        [
            node.PRIVATE_PAYOUT_DOMAIN,
            bytes(node.get_program_pubkey()),
            bytes(node.get_mother_escrow_pda()),
            bytes(operator),
            bytes(epoch_treasury), bytes(epoch_ledger), bytes(claim_slot), slot,
            settlement_commitment,
            commitment_digest,
            random_nonce,
            payout_nullifier,
            bytes(cranker_vault),
            bytes(recipient_wallet),
            bytes(token_mint),
            struct.pack("<Q", payout_amount),
            struct.pack("<Q", claim_fee_amount),
            lease_id_hash_value,
            struct.pack("<Q", lease_version),
            struct.pack("<q", lease_expiry_ts),
            struct.pack("<q", expires_at_ts),
        ]
    )
