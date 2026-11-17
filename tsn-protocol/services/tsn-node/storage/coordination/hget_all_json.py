"""hget_all_json: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
import json
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    get_mempool_store: Callable[..., Any]


async def hget_all_json(node: Dependencies, key: str) -> list:
    r = await node.get_mempool_store()
    raw: dict = await r.hgetall(key)
    return [json.loads(v) for v in raw.values()]
