"""_parse_usdc_base_units: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
import re
from typing import Any, Callable, Protocol



def _parse_usdc_base_units(value: str, label: str) -> int:
    match = re.fullmatch(r"(\d+)(?:\.(\d{1,6}))? USDC", value)
    if not match:
        raise HTTPException(400, f"{label} must be a decimal USDC amount in the signed message")
    return int(match.group(1)) * 1_000_000 + int((match.group(2) or "").ljust(6, "0"))
