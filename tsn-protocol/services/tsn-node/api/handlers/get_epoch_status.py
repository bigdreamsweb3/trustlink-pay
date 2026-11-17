"""get_epoch_status: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from core.schemas.epoch_status import EpochStatus
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    build_epoch_status: Callable[..., Any]


async def get_epoch_status(node: Dependencies) -> EpochStatus:
    return await node.build_epoch_status()
