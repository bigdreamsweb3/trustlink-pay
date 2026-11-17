"""_public_coordination: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any, Callable, Protocol



def _public_coordination(kind: str, value: dict) -> dict:
    if kind != "TCAP_EPOCH_ACCOUNTING":
        raise ValueError("PRIVATE_COORDINATION_KIND_INVALID")
    allowed = {"assetEntry", "reserveState", "tcapConfig", "accountingEpoch", "total", "proof"}
    result = {key: child for key, child in value.items() if key in allowed}
    if isinstance(result.get("proof"), dict):
        result["proof"] = {key: child for key, child in result["proof"].items()
                           if key in {"publicInputs", "proofA", "proofB", "proofC"}}
    return result
