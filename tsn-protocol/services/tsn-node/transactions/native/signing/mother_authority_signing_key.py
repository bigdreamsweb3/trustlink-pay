"""_mother_authority_signing_key: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from core.configuration import NODE_ROOT
from fastapi import HTTPException
from nacl.signing import SigningKey
from pathlib import Path
import hmac
import json
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_MOTHER_AUTHORITY_KEYPAIR_PATH: Any


def _mother_authority_signing_key(node: Dependencies) -> SigningKey:
    if not node.TSN_MOTHER_AUTHORITY_KEYPAIR_PATH:
        raise HTTPException(503, "Mother Node signing is not configured")
    key_path = Path(node.TSN_MOTHER_AUTHORITY_KEYPAIR_PATH).expanduser()
    if not key_path.is_absolute():
        key_path = NODE_ROOT / key_path
    try:
        secret = json.loads(key_path.read_text(encoding="utf-8"))
        if not isinstance(secret, list) or len(secret) != 64 or any(
            not isinstance(value, int) or value < 0 or value > 255 for value in secret
        ):
            raise ValueError("keypair must be a 64-byte Solana JSON keypair")
        signing_key = SigningKey(bytes(secret[:32]))
        if not hmac.compare_digest(bytes(signing_key.verify_key), bytes(secret[32:])):
            raise ValueError("keypair public key does not match its private seed")
        return signing_key
    except (OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
        raise HTTPException(503, "Mother Node signing keypair is unavailable or invalid") from exc
