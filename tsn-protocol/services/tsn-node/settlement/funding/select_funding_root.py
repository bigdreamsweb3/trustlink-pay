"""select_funding_root implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from settlement.funding.funding_contract import FUNDING_ROOT_CHANGED
from settlement.funding.funding_contract import FUNDING_ROOT_INVALID
from settlement.witness.field_hex import field_hex

def select_funding_root(state: dict[str, Any], root: str, count: int | None = None) -> dict[str, Any]:
    """Select only a root/count authenticated by the canonical global account."""
    try:
        field_hex(root)
    except ValueError as exc:
        raise ValueError(FUNDING_ROOT_INVALID) from exc
    candidates = [{"root": state["root"], "count": state["count"]}, *state["history"]]
    for candidate in candidates:
        if candidate["root"] == root and (count is None or candidate["count"] == count):
            return {**state, **candidate}
    raise ValueError(FUNDING_ROOT_CHANGED)
