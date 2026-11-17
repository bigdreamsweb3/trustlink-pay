"""k_recipient_route_binding: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    MEMPOOL_NS: Any


def k_recipient_route_binding(node: Dependencies, work_id: str) -> str: return f"{node.MEMPOOL_NS}:recipient_route_binding:{work_id}"
