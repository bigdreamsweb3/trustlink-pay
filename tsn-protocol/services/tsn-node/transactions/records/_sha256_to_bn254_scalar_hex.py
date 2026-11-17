"""_sha256_to_bn254_scalar_hex implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from transactions.records.record_contract import BN254_SCALAR_MODULUS
import hashlib

def _sha256_to_bn254_scalar_hex(value: bytes) -> str:
    """Match GPRU's canonical big-endian SHA-256-to-BN254-field reduction."""
    return (int.from_bytes(hashlib.sha256(value).digest(), "big") % BN254_SCALAR_MODULUS).to_bytes(32, "big").hex()
