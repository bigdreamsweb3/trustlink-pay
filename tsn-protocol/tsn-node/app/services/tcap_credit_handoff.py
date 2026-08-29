"""Additive TSN -> TCap credit authorization handoff.

This is the opaque field set consumed by TCAP's privacy-safe V2 tip credit. It
authorizes a credit-only transition; it is not a CrankerVault payout permit and
contains no payment intent, recipient TIN, amount, token account, or balance.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass


_HEX32 = re.compile(r"^[0-9a-f]{64}$")


def _commitment(label: str, value: str) -> str:
    normalized = value.lower()
    if not _HEX32.fullmatch(normalized):
        raise ValueError(f"{label}_invalid")
    return normalized


@dataclass(frozen=True)
class TcapCreditAuthorizationV2:
    tip: str
    previous_commitment: str
    new_commitment: str
    sequence: int
    token_id: int
    policy_commitment: str
    gpru_scope_commitment: str
    nullifier: str
    valid_after_slot: int
    expires_at_slot: int
    authorization_digest: str

    def __post_init__(self) -> None:
        if not self.tip or self.sequence < 1 or self.token_id < 1:
            raise ValueError("credit_authorization_scalar_invalid")
        if self.valid_after_slot < 0 or self.expires_at_slot < self.valid_after_slot:
            raise ValueError("credit_authorization_expiry_invalid")
        for label in (
            "previous_commitment",
            "new_commitment",
            "policy_commitment",
            "gpru_scope_commitment",
            "nullifier",
            "authorization_digest",
        ):
            _commitment(label, getattr(self, label))

    def instruction_fields(self) -> dict[str, object]:
        """Return only fields needed to construct the V2 TCAP instruction."""
        return asdict(self)


def build_tcap_credit_authorization(**fields: object) -> TcapCreditAuthorizationV2:
    """Node-side constructor used after proof verification and tip read."""
    return TcapCreditAuthorizationV2(**fields)  # type: ignore[arg-type]
