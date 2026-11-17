"""parse_optional_float: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
from typing import Optional
from typing import Any, Callable, Protocol



def parse_optional_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None
