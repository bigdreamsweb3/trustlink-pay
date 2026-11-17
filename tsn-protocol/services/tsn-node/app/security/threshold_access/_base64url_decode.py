from __future__ import annotations

import base64

def _base64url_decode(value: str, label: str) -> bytes:
    from .types import ThresholdAccessError
    try:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except (ValueError, TypeError) as exc:
        raise ThresholdAccessError(f"{label} is invalid") from exc
