"""clean_env: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations

def clean_env(value: str | None, default: str = "") -> str:
    return (value if value is not None else default).strip().strip('"').strip("'").strip()
