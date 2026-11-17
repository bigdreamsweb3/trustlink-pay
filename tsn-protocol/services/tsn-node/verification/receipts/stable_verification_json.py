"""_stable_verification_json: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from functools import partial
from .stable_verification_json_key import stable_verification_json_key
from decimal import Decimal
from typing import Any
import json
import math
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    _stable_verification_json: Callable[..., Any]


def _stable_verification_json(node: Dependencies, value: Any) -> str:
    """Match Receiver stable JSON for signing Node verification evidence."""
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(str(key), ensure_ascii=False) + ":" + node._stable_verification_json(child)
            for key, child in sorted(value.items(), key=stable_verification_json_key)
        ) + "}"
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(node._stable_verification_json(child) for child in value) + "]"
    if isinstance(value, float):
        if not math.isfinite(value):
            return "null"
        if value == 0:
            return "0"
        rendered = repr(value).lower()
        magnitude = abs(value)
        if 1e-6 <= magnitude < 1e21:
            decimal = format(Decimal(rendered), "f")
            return decimal.rstrip("0").rstrip(".") if "." in decimal else decimal
        if "e" in rendered:
            mantissa, exponent = rendered.split("e", 1)
            exponent_value = int(exponent)
            sign = "+" if exponent_value >= 0 else "-"
            return f"{mantissa}e{sign}{abs(exponent_value)}"
        return rendered
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
