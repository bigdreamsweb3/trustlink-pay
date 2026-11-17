"""_public_tcap_transition: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TCAP_CRANKER_TRANSITION_FIELDS: Any
    TCAP_PROOF_FIELDS: Any


def _public_tcap_transition(node: Dependencies, transition: dict[str, Any]) -> dict[str, Any]:
    result = {name: value for name, value in transition.items() if name in node.TCAP_CRANKER_TRANSITION_FIELDS}
    if isinstance(result.get("proof"), dict):
        result["proof"] = {name: value for name, value in result["proof"].items() if name in node.TCAP_PROOF_FIELDS}
    return result
