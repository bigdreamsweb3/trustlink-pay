from __future__ import annotations

from typing import Any

async def write(self, settlement_id: str, state: AttestationState, patch: dict[str, Any]) -> None:
    from .types import AttestationState
    async with self._lock:
        current = self.records.setdefault(settlement_id, {})
        current.update(patch)
        current["state"] = state.value
