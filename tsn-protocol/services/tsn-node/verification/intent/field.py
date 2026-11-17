"""_field: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
from typing import Any, Callable, Protocol



def _field(data: dict[str, Any], *names: str, default: Any = None) -> Any:
    for name in names:
        if name in data and data[name] is not None:
            return data[name]
    return default
