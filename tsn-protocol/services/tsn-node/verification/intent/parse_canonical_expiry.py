"""_parse_canonical_expiry: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from fastapi import HTTPException
from typing import Any, Callable, Protocol



def _parse_canonical_expiry(value: str) -> datetime:
    try:
        expires_at = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(400, "signed message expiry is not valid ISO 8601") from exc
    if expires_at <= datetime.now(timezone.utc):
        raise HTTPException(400, "signed message has expired")
    return expires_at
