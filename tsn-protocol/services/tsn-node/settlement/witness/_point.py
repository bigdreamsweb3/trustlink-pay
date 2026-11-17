"""_point implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from security.cryptography.gpru_contract import BABYJUB_FIELD
from security.cryptography.gpru_contract import BABYJUB_SUBORDER
from security.cryptography._babyjub_mul import _babyjub_mul
from settlement.witness.field import field

def _point(value: Any) -> tuple[int, int]:
    if not isinstance(value, dict) or set(value) != {"x", "y"}:
        raise ValueError("Hidden-head token point has an unsupported field set")
    x, y = field(value["x"]), field(value["y"])
    if (168700 * x * x + y * y - 1 - 168696 * x * x * y * y) % BABYJUB_FIELD:
        raise ValueError("Hidden-head token point is off the BabyJubjub curve")
    if _babyjub_mul((x, y), BABYJUB_SUBORDER) != (0, 1):
        raise ValueError("Hidden-head token point is outside the prime-order subgroup")
    return x, y
