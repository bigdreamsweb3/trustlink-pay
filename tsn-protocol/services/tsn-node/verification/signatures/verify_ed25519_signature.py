"""_verify_ed25519_signature: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    _decode_base64_signature: Callable[..., Any]
    decode_base58: Callable[..., Any]


def _verify_ed25519_signature(node: Dependencies, *, public_key: str, message: bytes, signature_base64: str) -> None:
    try:
        VerifyKey(node.decode_base58(public_key)).verify(message, node._decode_base64_signature(signature_base64))
    except (BadSignatureError, ValueError) as exc:
        raise HTTPException(403, "signature verification failed") from exc
