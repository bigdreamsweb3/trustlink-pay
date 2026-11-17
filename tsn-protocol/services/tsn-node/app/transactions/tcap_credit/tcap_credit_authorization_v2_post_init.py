from __future__ import annotations

from ._commitment import _commitment

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
