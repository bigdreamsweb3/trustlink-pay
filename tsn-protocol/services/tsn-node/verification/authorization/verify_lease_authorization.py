"""verify_lease_authorization: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from fastapi import HTTPException
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey
from typing import Literal
import base64
import binascii
import time
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    LEASE_AUTH_MAX_AGE_SECS: Any
    lease_authorization_message: Callable[..., Any]


def verify_lease_authorization(node: Dependencies,
    action: Literal["payout", "recovery", "funding", "settlement"],
    work_id: str,
    operator_pubkey: str,
    requested_at_ts: int,
    signature_base64: str,
) -> Pubkey:
    now = int(time.time())
    if abs(now - requested_at_ts) > node.LEASE_AUTH_MAX_AGE_SECS:
        raise HTTPException(401, "Cranker lease authorization expired")
    try:
        operator = Pubkey.from_string(operator_pubkey)
        signature = base64.b64decode(signature_base64, validate=True)
        VerifyKey(bytes(operator)).verify(
            node.lease_authorization_message(
                action,
                work_id,
                operator_pubkey,
                requested_at_ts,
            ),
            signature,
        )
    except (ValueError, BadSignatureError, binascii.Error) as exc:
        raise HTTPException(401, "Invalid Cranker lease authorization") from exc
    return operator
