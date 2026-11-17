"""require_worker_api_key: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
from fastapi import Header
from typing import Optional
import secrets
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    MEMPOOL_API_KEY: Any
    TSN_RECEIVER_NODE_API_KEY: Any


def require_worker_api_key(node: Dependencies,
    x_api_key: Optional[str] = Header(None, alias="x-api-key"),
) -> None:
    expected = node.TSN_RECEIVER_NODE_API_KEY or node.MEMPOOL_API_KEY
    if not expected or not secrets.compare_digest(x_api_key or "", expected):
        raise HTTPException(401, "Invalid TSN Node service credential")
