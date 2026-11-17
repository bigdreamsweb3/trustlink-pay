"""wake_receiver_verification: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import Depends
from fastapi import HTTPException
from typing import Any
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    _receiver_wake_event: Any
    close_epoch_task: Callable[..., Any]
    is_epoch_due: Callable[..., Any]
    logger: Any
    read_epoch_state: Callable[..., Any]


async def wake_receiver_verification(node: Dependencies) -> dict[str, Any]:
    """Wake the verifier after Receiver commit; carries no work payload."""
    if node._receiver_wake_event is None:
        raise HTTPException(503, "TSN Node verifier is not ready")
    if node.is_epoch_due(await node.read_epoch_state()):
        try:
            result = await node.close_epoch_task()
            node.logger.info("Wake-triggered epoch close completed: %s", result.message)
        except Exception:
            node.logger.exception("Wake-triggered epoch close failed; work remains available")
    node._receiver_wake_event.set()
    node.logger.info("TSN Receiver wake accepted")
    return {"ok": True, "status": "awake"}
