"""_assert_authorized_credit_preconditions: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
from funding_snapshot_sync import FUNDING_ROOT_CHANGED
from typing import Any
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    _assert_tcap_gpru_credit_program_preconditions: Callable[..., Any]


async def _assert_authorized_credit_preconditions(node: Dependencies, transition: dict[str, Any]) -> None:
    try:
        await node._assert_tcap_gpru_credit_program_preconditions(transition)
    except ValueError as exc:
        if str(exc) in (FUNDING_ROOT_CHANGED, "TCAP_CREDIT_EPOCH_CHANGED_BEFORE_SETTLEMENT", "TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT"):
            raise HTTPException(409, str(exc)) from exc
        raise
