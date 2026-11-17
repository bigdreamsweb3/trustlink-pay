from __future__ import annotations

from decimal import Decimal
from decimal import InvalidOperation

def canonical_route_amount(value: float | str | Decimal) -> str:
    """Use one JSON-compatible spelling for the amount in route attestations.

    Python renders a float such as ``1.0`` differently from JavaScript's
    ``String(JSON.parse("1.0"))`` (``1``).  Normalising here keeps the signed
    attestation bound to the same exact settlement value on both runtimes.
    """
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("route authorization amount must be numeric") from exc
    if not amount.is_finite() or amount <= 0:
        raise ValueError("route authorization amount must be positive")
    normalized = format(amount.normalize(), "f")
    whole, dot, fraction = normalized.partition(".")
    fraction = fraction.rstrip("0")
    return f"{whole}{dot}{fraction}" if fraction else whole
