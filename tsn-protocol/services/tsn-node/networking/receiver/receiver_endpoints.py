"""receiver_endpoints: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_RECEIVER_FALLBACK_URL: Any
    TSN_RECEIVER_URL: Any


def receiver_endpoints(node: Dependencies, path: str) -> list[str]:
    return list(dict.fromkeys(
        f"{base.rstrip('/')}/{path.lstrip('/')}"
        for base in (node.TSN_RECEIVER_URL, node.TSN_RECEIVER_FALLBACK_URL)
        if base
    ))
