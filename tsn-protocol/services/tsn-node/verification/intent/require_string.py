"""_require_string: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
from typing import Any
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    _field: Callable[..., Any]


def _require_string(node: Dependencies, data: dict[str, Any], *names: str) -> str:
    value = node._field(data, *names)
    if value is None or str(value).strip() == "":
        raise HTTPException(422, f"{names[0]} is required")
    return str(value).strip()
