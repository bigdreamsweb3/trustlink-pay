"""decode_funding_root implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from settlement.funding.funding_contract import FUNDING_ROOT_INVALID
from settlement.funding.funding_contract import TCAP_PROGRAM
from settlement.funding._decode_funding_root import _decode_funding_root

def decode_funding_root(account: Any, program: str = TCAP_PROGRAM) -> dict[str, Any]:
    try:
        return _decode_funding_root(account, program)
    except (ValueError, TypeError, KeyError, IndexError) as exc:
        raise ValueError(FUNDING_ROOT_INVALID) from exc
