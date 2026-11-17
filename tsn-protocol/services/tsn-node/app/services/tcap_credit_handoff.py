"""Additive TSN -> TCap credit authorization handoff.

This is the opaque field set consumed by TCAP's privacy-safe V2 tip credit. It
authorizes a credit-only transition; it is not a CrankerVault payout permit and
contains no payment intent, recipient TIN, amount, token account, or balance."""

from app.transactions.tcap_credit import (
    _commitment,
    build_tcap_credit_authorization,
    TcapCreditAuthorizationV2,
    _HEX32,
)

__all__ = ['_commitment', 'build_tcap_credit_authorization', 'TcapCreditAuthorizationV2', '_HEX32']
