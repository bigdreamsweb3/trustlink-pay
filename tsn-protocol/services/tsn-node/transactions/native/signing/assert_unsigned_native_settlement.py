"""_assert_unsigned_native_settlement: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
from typing import Any
from typing import Any, Callable, Protocol



def _assert_unsigned_native_settlement(work: dict[str, Any]) -> None:
    # A recorded identity may already have reached Solana, even if the send failed.
    result = work.get("result")
    if result is not None and (not isinstance(result, dict) or result):
        raise HTTPException(409, "TCAP_SETTLEMENT_EXECUTION_CHECKPOINT_PRESENT")
