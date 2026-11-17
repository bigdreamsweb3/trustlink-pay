"""ui_amount_to_base_units: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from decimal import Decimal
from decimal import InvalidOperation
from fastapi import HTTPException
from typing import Any
from typing import Any, Callable, Protocol



def ui_amount_to_base_units(value: Any, decimals: int, *, allow_zero: bool = False) -> int:
    try:
        amount = Decimal(str(value))
        scaled = amount * (Decimal(10) ** decimals)
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise HTTPException(422, "Intent amount is invalid") from exc
    if amount < 0 or (amount == 0 and not allow_zero):
        raise HTTPException(422, "Intent amount must be positive")
    if scaled != scaled.to_integral_value():
        raise HTTPException(
            422,
            f"Intent amount has invalid token precision (received={format(amount, 'f')}, token_decimals={decimals})",
        )
    result = int(scaled)
    if result > 0xFFFF_FFFF_FFFF_FFFF:
        raise HTTPException(422, "Intent amount is outside the u64 range")
    return result
