"""balance_point: private preparation component; validates the canonical debit contract.

Inputs, outputs and failure predicates are defined by the typed implementation.
Dependencies are explicit imports; no service state or RPC is accessed.
"""
from __future__ import annotations
from security.cryptography._babyjub_add import _babyjub_add
from security.cryptography._babyjub_mul import _babyjub_mul
from security.cryptography.gpru_contract import BABYJUB_BASE8
from settlement.witness.witness_contract import BALANCE_H
from .contract import BABYJUB_SUBORDER
from .uint import uint


def balance_point(balance: int, blinding: int) -> tuple[int, int]:
    uint(balance, 128)
    uint(blinding, 252)
    if blinding >= BABYJUB_SUBORDER:
        raise ValueError("Transfer balance blinding is noncanonical")
    return _babyjub_add(_babyjub_mul(BABYJUB_BASE8, balance), _babyjub_mul(BALANCE_H, blinding))
