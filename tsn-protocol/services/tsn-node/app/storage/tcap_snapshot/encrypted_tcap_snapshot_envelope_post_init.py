from __future__ import annotations

from .constants import _COMMITMENT_RE

def __post_init__(self) -> None:
    if self.version != 1:
        raise ValueError("unsupported_snapshot_version")
    if self.sequence < 0 or self.created_at < 0:
        raise ValueError("snapshot_number_invalid")
    for label, value in (
        ("previous_commitment", self.previous_commitment),
        ("new_commitment", self.new_commitment),
        ("policy_commitment", self.policy_commitment),
        ("transition_nullifier", self.transition_nullifier),
        ("tsn_settlement_commitment", self.tsn_settlement_commitment),
    ):
        if not _COMMITMENT_RE.fullmatch(value.lower()):
            raise ValueError(f"{label}_invalid")
    if not self.encrypted_record_locator or len(self.nonce) != 12 or not self.ciphertext:
        raise ValueError("invalid_encrypted_snapshot_envelope")
