"""route_fields: private preparation component; validates the canonical debit contract.

Inputs, outputs and failure predicates are defined by the typed implementation.
Dependencies are explicit imports; no service state or RPC is accessed.
"""
from __future__ import annotations
from security.cryptography.gpru_contract import BABYJUB_FIELD
from settlement.witness._point import _point
from typing import Any
import re
from .scalar import scalar


def route_fields(route: dict[str, Any]) -> list[int]:
    required = ("lookupCommitment", "gpruElgamalKeyCommitment",
                "gpruBalanceScanPublicKeyX", "gpruBalanceScanPublicKeyY", "policyCommitment")
    if not isinstance(route, dict) or any(name not in route for name in required):
        raise ValueError("Transfer route is incomplete")
    values = []
    for name in required:
        encoded = route[name]
        if not isinstance(encoded, str) or not re.fullmatch(r"[0-9a-f]{64}", encoded):
            raise ValueError("Transfer route has a malformed commitment")
        number = int(encoded, 16)
        values.append(number % BABYJUB_FIELD if name in required[:2] + required[4:] else scalar(number))
    if values[1] == 0 or values[2] == 0:
        raise ValueError("Transfer route key or scan point is invalid")
    _point({"x": str(values[2]), "y": str(values[3])})
    return values
