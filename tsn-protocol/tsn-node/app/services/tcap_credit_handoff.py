"""Additive TSN -> TCap credit authorization handoff.

This is the exact field set consumed by TCap's
`register_tsn_authorization_v1` receipt and
`credit_tcap_tin_tip_v1`. It authorizes a credit-only transition; it is not a
CrankerVault payout permit and contains no token account or balance.
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
class TcapCreditAuthorizationV1:
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
    tsn_settlement_commitment: str
    epoch_id: int
    transition_type: str = "ConfidentialSettlement"

    def __post_init__(self) -> None:
        if not self.tip or self.sequence < 1 or self.token_id < 1 or self.epoch_id < 0:
            raise ValueError("credit_authorization_scalar_invalid")
        if self.valid_after_slot < 0 or self.expires_at_slot < self.valid_after_slot:
            raise ValueError("credit_authorization_expiry_invalid")
        if self.transition_type != "ConfidentialSettlement":
            raise ValueError("credit_authorization_transition_invalid")
        for label in (
            "previous_commitment",
            "new_commitment",
            "policy_commitment",
            "gpru_scope_commitment",
            "nullifier",
            "tsn_settlement_commitment",
        ):
            _commitment(label, getattr(self, label))

    def receipt_fields(self) -> dict[str, object]:
        """Return only fields needed to construct the TCap authorization."""
        return asdict(self)


def build_tcap_credit_authorization(**fields: object) -> TcapCreditAuthorizationV1:
    """Node-side constructor used after funding confirmation and tip read."""
    return TcapCreditAuthorizationV1(**fields)  # type: ignore[arg-type]
