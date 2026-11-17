"""_build_canonical_message: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_CANONICAL_DOMAIN_DISPLAY: Any


def _build_canonical_message(node: Dependencies, action: str, fields: list[tuple[str, str]]) -> str:
    return "\n".join(
        [f"TSN {action}", "---"]
        + [f"{label}: {value}" for label, value in fields]
        + [f"Domain: {node.TSN_CANONICAL_DOMAIN_DISPLAY}"]
    )
