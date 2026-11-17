from __future__ import annotations

from dataclasses import asdict

def instruction_fields(self) -> dict[str, object]:
    """Return only fields needed to construct the V2 TCAP instruction."""
    return asdict(self)
