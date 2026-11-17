from __future__ import annotations

from typing import Any
import httpx

async def _call(self, operation: str, **payload: Any) -> dict[str, Any]:
    last_error: Exception | None = None
    for endpoint in dict.fromkeys(self.endpoints):
        try:
            response = await self.client.post(
                endpoint,
                headers=self.headers,
                json={"operation": operation, **payload},
            )
            if response.status_code >= 500:
                detail = response.text[:300]
                last_error = RuntimeError(
                    f"TSN Receiver state operation failed ({response.status_code}): {detail}"
                )
                continue
            if response.status_code >= 400:
                detail = response.text[:300]
                raise RuntimeError(
                    f"TSN Receiver state operation failed ({response.status_code}): {detail}"
                )
            value = response.json()
            if not isinstance(value, dict):
                raise RuntimeError("TSN Receiver returned an invalid state response")
            return value
        except httpx.RequestError as error:
            last_error = error
    raise RuntimeError("TSN Receiver state operation failed on all configured endpoints") from last_error
