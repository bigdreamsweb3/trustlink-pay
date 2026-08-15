from __future__ import annotations

from typing import Any, Optional

import httpx


class ReceiverStore:
    """Remote durable-state adapter. The TSN Node retains no queue database."""

    def __init__(self, base_url: str, api_key: str, fallback_url: str | None = None):
        if not base_url or not api_key:
            raise RuntimeError("TSN Receiver URL and Node API key are required")
        urls = [base_url, fallback_url] if fallback_url else [base_url]
        urls = [url.strip().strip('"').strip("'").strip() for url in urls if url]
        self.endpoints = [f"{url.rstrip('/')}/api/internal/node/state" for url in urls if url]
        self.headers = {"x-api-key": api_key.strip().strip('"').strip("'"), "content-type": "application/json"}
        self.client = httpx.AsyncClient(timeout=20)

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
                    last_error = RuntimeError(f"TSN Receiver state operation failed ({response.status_code})")
                    continue
                if response.status_code >= 400:
                    raise RuntimeError(f"TSN Receiver state operation failed ({response.status_code})")
                value = response.json()
                if not isinstance(value, dict):
                    raise RuntimeError("TSN Receiver returned an invalid state response")
                return value
            except httpx.RequestError as error:
                last_error = error
        raise RuntimeError("TSN Receiver state operation failed on all configured endpoints") from last_error

    async def get(self, key: str) -> Optional[str]:
        return (await self._call("get", key=key)).get("value")

    async def set(self, key: str, value: str) -> None:
        await self._call("set", key=key, value=value)

    async def hget(self, key: str, field: str) -> Optional[str]:
        return (await self._call("hget", key=key, field=field)).get("value")

    async def hgetall(self, key: str) -> dict[str, Any]:
        return dict((await self._call("hgetall", key=key)).get("values") or {})

    async def hlen(self, key: str) -> int:
        return len(await self.hgetall(key))

    async def hset(
        self,
        key: str,
        field: Optional[str] = None,
        value: Optional[str] = None,
        mapping: Optional[dict] = None,
    ) -> None:
        await self._call("hset", key=key, field=field, value=value, mapping=mapping)

    async def consume_once(self, key: str, field: str, value: str) -> bool:
        return bool((await self._call(
            "consume_once", key=key, field=field, value=value
        )).get("consumed"))

    async def delete(self, *keys: str) -> None:
        await self._call("delete", key=keys[0] if keys else "unused", keys=list(keys))

    async def aclose(self) -> None:
        await self.client.aclose()
