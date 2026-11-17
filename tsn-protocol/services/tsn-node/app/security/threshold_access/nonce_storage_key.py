from __future__ import annotations

from .constants import NONCE_RECEIPT_DOMAIN
from ._canonical_fields import _canonical_fields
from ._hash_hex import _hash_hex

def nonce_storage_key(verified: dict[str, str]) -> str:
    return _hash_hex(_canonical_fields([
        NONCE_RECEIPT_DOMAIN,
        verified["operation"],
        verified["tin"],
        verified["ownerPublicKey"],
        verified["resourceCommitment"],
        verified["requestNonce"],
    ]))
