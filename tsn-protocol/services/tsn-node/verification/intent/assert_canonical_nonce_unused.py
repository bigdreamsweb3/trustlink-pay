"""_assert_canonical_nonce_unused: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from fastapi import HTTPException
import hashlib
import json
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    get_mempool_store: Callable[..., Any]
    k_canonical_message_nonces: Callable[..., Any]


async def _assert_canonical_nonce_unused(node: Dependencies,
    *, action: str, authorization_domain: str, sender_public_key: str, nonce: str
) -> None:
    """Atomically consume a sender authorization nonce.

    The key is deliberately scoped to the signed authorization domain and
    sender.  ``consume_once`` performs the check and insert in one transaction
    in the Receiver state store, so concurrent Node workers cannot both accept
    the same signed authorization.
    """
    if not authorization_domain or not sender_public_key or not nonce:
        raise HTTPException(400, "signed message nonce identity is incomplete")
    key = hashlib.sha256(
        f"{authorization_domain}|{action}|{sender_public_key}|{nonce}".encode("utf-8")
    ).hexdigest()
    consumed = await (await node.get_mempool_store()).consume_once(
        node.k_canonical_message_nonces(),
        key,
        json.dumps(
            {
                "domain": authorization_domain,
                "action": action,
                "senderPublicKey": sender_public_key,
                "nonce": nonce,
                "usedAt": datetime.now(timezone.utc).isoformat(),
            },
            separators=(",", ":"),
        ),
    )
    if not consumed:
        raise HTTPException(400, "signed message nonce has already been used")
