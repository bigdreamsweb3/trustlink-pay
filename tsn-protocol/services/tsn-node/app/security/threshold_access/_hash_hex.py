from __future__ import annotations

import hashlib

def _hash_hex(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()
