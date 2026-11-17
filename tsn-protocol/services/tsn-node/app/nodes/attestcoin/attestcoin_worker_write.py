from __future__ import annotations

from typing import Any
from dataclasses import asdict

async def _write(self, job: TinExitAttestationJob, state: AttestationState, patch: dict[str, Any]) -> None:
    from .types import AttestationState, TinExitAttestationJob
    await self.tracker.write(job.settlement_id, state, {**patch, "job": asdict(job)})
