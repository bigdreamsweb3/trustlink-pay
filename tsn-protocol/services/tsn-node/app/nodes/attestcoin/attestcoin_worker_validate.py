from __future__ import annotations



def _validate(job: TinExitAttestationJob) -> None:
    from .types import TinExitAttestationJob
    if not job.merchant_override:
        raise ValueError("TinExitAttested must be explicitly requested by policy")
    if not job.settlement_id or not job.anchor_tx_hash:
        raise ValueError("settlement_id and anchor_tx_hash are required")
    for name, value in (
        ("sealed_tip_head_hash", job.sealed_tip_head_hash),
        ("tin_hash", job.tin_hash),
        ("exit_commitment", job.exit_commitment),
    ):
        if not value.startswith("0x") or len(value) != 66:
            raise ValueError(f"{name} must be a 32-byte 0x hash")
    if int(job.amount) <= 0:
        raise ValueError("amount must be positive")
