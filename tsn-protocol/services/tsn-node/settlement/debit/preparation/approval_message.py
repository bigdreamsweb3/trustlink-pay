"""approval_message: private preparation component; validates the canonical debit contract.

Inputs, outputs and failure predicates are defined by the typed implementation.
Dependencies are explicit imports; no service state or RPC is accessed.
"""
from __future__ import annotations
from .contract import SIGNATURE_DOMAIN
from .scalar import scalar


def approval_message(authorization_commitment: int) -> bytes:
    return SIGNATURE_DOMAIN + scalar(authorization_commitment, nonzero=True).to_bytes(32, "big")
