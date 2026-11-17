from __future__ import annotations



def _idempotency_key(job: TinExitAttestationJob) -> str:
    from .types import TinExitAttestationJob
    return f"{job.settlement_id}:{job.exit_commitment}"
