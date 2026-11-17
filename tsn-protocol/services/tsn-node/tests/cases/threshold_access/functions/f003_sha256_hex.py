from __future__ import annotations

def sha256_hex(value: bytes) -> str:
    import hashlib
    return hashlib.sha256(value).hexdigest()
