"""Creditcoin-first settlement boundary.

This module is deliberately independent from the Solana program. The Node
supplies already-validated public hashes and a destination address; the
Creditcoin Cranker transports the authorized request. It does not generate
proofs, anchor transactions, or hold private TIN data."""

from app.transactions.creditcoin import (
    _bytes32,
    _evm_address,
    CreditcoinPayoutAuthorization,
    CreditcoinNetwork,
)

__all__ = ['_bytes32', '_evm_address', 'CreditcoinPayoutAuthorization', 'CreditcoinNetwork']
