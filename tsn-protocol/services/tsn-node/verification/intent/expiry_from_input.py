"""_expiry_from_input: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
from typing import Any
import time
from typing import Any, Callable, Protocol



def _expiry_from_input(value: Any) -> int:
    try:
        expiry = int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, "expiry must be a unix timestamp in seconds") from exc
    if expiry <= int(time.time()):
        raise HTTPException(409, "TIN operation intent is expired")
    return expiry
