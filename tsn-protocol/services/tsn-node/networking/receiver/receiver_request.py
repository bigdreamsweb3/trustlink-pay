"""receiver_request: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
import httpx
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    receiver_endpoints: Callable[..., Any]


async def receiver_request(node: Dependencies, client: httpx.AsyncClient, method: str, path: str, **kwargs: Any) -> httpx.Response:
    last_error: Exception | None = None
    for endpoint in node.receiver_endpoints(path):
        try:
            response = await client.request(method, endpoint, **kwargs)
            if response.status_code < 500:
                return response
            last_error = RuntimeError(f"TSN Receiver returned {response.status_code}")
        except httpx.RequestError as error:
            last_error = error
    raise RuntimeError("TSN Receiver unavailable on all configured endpoints") from last_error
