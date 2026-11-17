from __future__ import annotations

from typing import Any
from ._hash_hex import _hash_hex
import json

def threshold_request_commitment(request: dict[str, Any]) -> str:
    """Bind idempotent Lit retries to one byte-equivalent public request."""
    return _hash_hex(json.dumps(
        request,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8"))
