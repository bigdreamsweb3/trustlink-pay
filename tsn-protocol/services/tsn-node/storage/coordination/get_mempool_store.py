"""get_mempool_store: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    get_store: Callable[..., Any]


async def get_mempool_store(node: Dependencies) -> Any:
    return await node.get_store()
