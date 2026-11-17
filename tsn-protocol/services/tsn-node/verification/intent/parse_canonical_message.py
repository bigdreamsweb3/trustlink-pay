"""_parse_canonical_message: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_CANONICAL_DOMAIN_DISPLAY: Any


def _parse_canonical_message(node: Dependencies, message: str, expected_action: str) -> dict[str, str]:
    if not isinstance(message, str) or not message.startswith("TSN "):
        raise HTTPException(400, "signed message is not a canonical TSN message")
    lines = message.split("\n")
    if len(lines) < 4 or lines[0] != f"TSN {expected_action}" or lines[1] != "---":
        raise HTTPException(400, f"signed message must use the TSN {expected_action} template")
    parsed: dict[str, str] = {}
    for line in lines[2:]:
        if ": " not in line:
            raise HTTPException(400, f"canonical signed message field is malformed: {line}")
        label, value = line.split(": ", 1)
        if label in parsed:
            raise HTTPException(400, f"canonical signed message field is duplicated: {label}")
        parsed[label] = value
    if parsed.get("Domain") != node.TSN_CANONICAL_DOMAIN_DISPLAY:
        raise HTTPException(400, "canonical signed message domain does not match TSN")
    return parsed
