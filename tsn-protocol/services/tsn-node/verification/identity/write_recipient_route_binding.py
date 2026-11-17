"""write_recipient_route_binding: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
import json
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    get_mempool_store: Callable[..., Any]
    k_recipient_route_binding: Callable[..., Any]


async def write_recipient_route_binding(node: Dependencies,
    *, work_id: str, tin: str, commitment: str, route_version: int, expires_at: str,
) -> None:
    """Persist the recipient reference separately from the sender's intent.

    The payment work document contains only the signed route commitment.  The
    Node retains this short-lived reference so it can resolve the recipient
    route later when a funded settlement needs authorization.
    """
    await (await node.get_mempool_store()).set(
        node.k_recipient_route_binding(work_id),
        json.dumps({
            "tin": tin,
            "commitment": commitment.lower(),
            "routeVersion": route_version,
            "expiresAt": expires_at,
        }),
    )
