"""_current_credit_epoch: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from private_credit_coordination import PrivateCreditWait
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    read_epoch: Callable[..., Any]
    solana_rpc: Callable[..., Any]


async def _current_credit_epoch(node: Dependencies, asset: str, reserve: str) -> tuple[str, int]:
    epoch = await node.read_epoch(node.solana_rpc, asset, reserve)
    if epoch["count"] == 64:
        raise PrivateCreditWait("TCAP_EPOCH_ACCOUNTING_REQUIRED")
    return epoch["address"], epoch["number"]
