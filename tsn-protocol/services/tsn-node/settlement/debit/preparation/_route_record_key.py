"""_route_record_key: private preparation component; validates the canonical debit contract.

Inputs, outputs and failure predicates are defined by the typed implementation.
Dependencies are explicit imports; no service state or RPC is accessed.
"""
from __future__ import annotations
from typing import Any
import hashlib
import re


def _route_record_key(route: dict[str, Any]) -> bytes:
    public = route.get("gpruElgamalPublicKey")
    if not isinstance(public, str) or not re.fullmatch(r"[0-9a-f]{64}", public):
        raise ValueError("Transfer requires the registered owner record public key")
    key = bytes.fromhex(public)
    expected = hashlib.sha256(b"TSN_GPRU_ELGAMAL_KEY_COMMITMENT_V1\0" + b"\x01" + key).hexdigest()
    if expected != route["gpruElgamalKeyCommitment"]:
        raise ValueError("Transfer owner record key does not match its authenticated route")
    return key
