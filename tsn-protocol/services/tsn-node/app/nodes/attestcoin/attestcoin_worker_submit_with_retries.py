from __future__ import annotations

from typing import Any
import asyncio
from .constants import logger

async def _submit_with_retries(self, payload: dict[str, Any]) -> str:
    last_error: Exception | None = None
    for attempt in range(self.max_retries):
        try:
            return await self.cranker.submit_tin_exit_proof(payload)
        except Exception as exc:  # noqa: BLE001 - retry boundary
            last_error = exc
            delay = min(60, 2**attempt)
            logger.warning("Creditcoin submission failed attempt=%s retry_in=%ss error=%s", attempt + 1, delay, exc)
            if attempt + 1 < self.max_retries:
                await asyncio.sleep(delay)
    raise RuntimeError("Creditcoin ASC submission failed after retries") from last_error
