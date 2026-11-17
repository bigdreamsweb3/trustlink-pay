"""_receiver_verified_payload: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
from typing import Any, Callable, Protocol



def _receiver_verified_payload(work: dict[str, Any]) -> dict[str, Any] | None:
    verification = work.get("verification") or {}
    verified = verification.get("verifiedPayload")
    if isinstance(verified, dict):
        return dict(verified)
    delta = verification.get("payloadDelta")
    if not isinstance(delta, dict):
        return None
    payload = dict(work.get("payload") or {})
    for key in delta.get("removedFields") or []:
        payload.pop(str(key), None)
    payload.update(delta.get("addedFields") or {})
    for key, value in (delta.get("changedFields") or {}).items():
        if isinstance(value, dict) and "nodeVerified" in value:
            payload[key] = value["nodeVerified"]
        else:
            payload[key] = value
    return payload
