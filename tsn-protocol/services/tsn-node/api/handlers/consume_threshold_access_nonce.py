"""consume_threshold_access_nonce: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from fastapi import HTTPException
from nacl.signing import SigningKey
from typing import Any
import json
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_THRESHOLD_NONCE_SIGNING_KEY: Any
    ThresholdAccessError: Any
    create_signed_nonce_receipt: Any
    decode_secret_key: Callable[..., Any]
    get_mempool_store: Callable[..., Any]
    k_threshold_access_nonces: Callable[..., Any]
    nonce_storage_key: Any
    threshold_request_commitment: Any
    verify_threshold_access_request: Any


async def consume_threshold_access_nonce(node: Dependencies, request: dict[str, Any]) -> dict[str, Any]:
    """Verify wallet + device authorization and atomically consume its nonce.

    This endpoint receives public proofs only. Its signing key attests nonce
    consumption and cannot decrypt TIN data, derive a PRU, or authorize funds.
    """
    if not node.TSN_THRESHOLD_NONCE_SIGNING_KEY:
        raise HTTPException(503, "TIN threshold nonce verifier is not configured")
    try:
        verified = node.verify_threshold_access_request(request)
        signing_key = SigningKey(
            node.decode_secret_key(
                node.TSN_THRESHOLD_NONCE_SIGNING_KEY,
                {32, 64},
                "TSN_THRESHOLD_NONCE_SIGNING_KEY",
            )[:32]
        )
    except node.ThresholdAccessError as exc:
        raise HTTPException(403, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(503, "TIN threshold nonce verifier is unavailable") from exc

    consumed_at = datetime.now(timezone.utc)
    receipt = node.create_signed_nonce_receipt(
        verified,
        consumed_at=consumed_at,
        signing_key=signing_key,
    )
    storage_key = node.nonce_storage_key(verified)
    store = await node.get_mempool_store()
    request_commitment = node.threshold_request_commitment(request)
    stored_record = {
        "requestCommitment": request_commitment,
        "receipt": receipt,
    }
    consumed = await store.consume_once(
        node.k_threshold_access_nonces(),
        storage_key,
        json.dumps(stored_record, separators=(",", ":")),
    )
    if not consumed:
        existing_raw = await store.hget(node.k_threshold_access_nonces(), storage_key)
        try:
            existing = json.loads(existing_raw or "null")
        except json.JSONDecodeError as exc:
            raise HTTPException(409, "authorized-device proof nonce has conflicting state") from exc
        if (
            not isinstance(existing, dict)
            or existing.get("requestCommitment") != request_commitment
            or not isinstance(existing.get("receipt"), dict)
        ):
            raise HTTPException(409, "authorized-device proof nonce has already been used")
        return existing["receipt"]
    return receipt
