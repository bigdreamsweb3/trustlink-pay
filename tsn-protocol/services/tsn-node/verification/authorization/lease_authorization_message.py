"""lease_authorization_message: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Literal
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    MEMPOOL_LEASE_DOMAIN: Any


def lease_authorization_message(node: Dependencies,
    action: Literal["payout", "recovery", "funding", "settlement"],
    work_id: str,
    operator_pubkey: str,
    requested_at_ts: int,
) -> bytes:
    return "|".join(
        [
            node.MEMPOOL_LEASE_DOMAIN,
            action,
            work_id,
            operator_pubkey,
            str(requested_at_ts),
        ]
    ).encode()
