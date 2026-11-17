from __future__ import annotations

from typing import Any
from ._base64url_decode import _base64url_decode

def _canonical_jwk(value: Any, curve: str, label: str) -> tuple[dict[str, str], bytes]:
    from .types import ThresholdAccessError
    if not isinstance(value, dict):
        raise ThresholdAccessError(f"{label} is invalid")
    canonical = {
        "kty": str(value.get("kty") or ""),
        "crv": str(value.get("crv") or ""),
        "x": str(value.get("x") or ""),
    }
    if canonical["kty"] != "OKP" or canonical["crv"] != curve:
        raise ThresholdAccessError(f"{label} must be an OKP {curve} public key")
    raw = _base64url_decode(canonical["x"], label)
    if len(raw) != 32:
        raise ThresholdAccessError(f"{label} must contain a 32-byte public key")
    return canonical, raw
