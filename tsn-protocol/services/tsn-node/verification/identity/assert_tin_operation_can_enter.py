"""assert_tin_operation_can_enter: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from fastapi import HTTPException
from typing import Any
import hashlib
import json
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    get_mempool_store: Callable[..., Any]
    k_tin_operation_nonces: Callable[..., Any]


async def assert_tin_operation_can_enter(node: Dependencies, operation: dict[str, Any]) -> None:
    nonce_key = hashlib.sha256(
        f"TSN_TIN_OPERATION|{operation['intentType']}|{operation['ownerPubkey']}|{operation['nonce']}".encode("utf-8")
    ).hexdigest()
    consumed = await (await node.get_mempool_store()).consume_once(
        node.k_tin_operation_nonces(),
        nonce_key,
        json.dumps(
            {
                "domain": "TSN_TIN_OPERATION",
                "intentType": operation["intentType"],
                "ownerPubkey": operation["ownerPubkey"],
                "nonce": operation["nonce"],
                "consumedAt": datetime.now(timezone.utc).isoformat(),
            },
            separators=(",", ":"),
        ),
    )
    if not consumed:
        raise HTTPException(409, "nonce has already been used by this owner_pubkey")
