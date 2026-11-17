"""k_tin_operation_nonces: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    MEMPOOL_NS: Any


def k_tin_operation_nonces(node: Dependencies) -> str: return f"{node.MEMPOOL_NS}:tin_operation_nonces"
