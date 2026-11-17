"""close_epoch: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import Depends
from core.schemas.epoch_close_result import EpochCloseResult
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    close_epoch_task: Callable[..., Any]
    logger: Any


async def close_epoch(node: Dependencies) -> EpochCloseResult:
    """Manually close the current epoch, archive it, and roll unresolved work forward."""
    node.logger.info("Manual epoch close triggered")
    return await node.close_epoch_task()
