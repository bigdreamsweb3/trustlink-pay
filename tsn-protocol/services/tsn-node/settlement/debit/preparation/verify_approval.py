"""verify_approval: private preparation component; validates the canonical debit contract.

Inputs, outputs and failure predicates are defined by the typed implementation.
Dependencies are explicit imports; no service state or RPC is accessed.
"""
from __future__ import annotations
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey
import hashlib
import re
from .approval_message import approval_message


def verify_approval(approval: dict[str, str], owner_commitment: str, commitment: int) -> None:
    if not isinstance(approval, dict) or set(approval) != {"ownerPublicKey", "signature"}:
        raise ValueError("Transfer approval has an unsupported field set")
    public = approval["ownerPublicKey"]
    signature = approval["signature"]
    if (not isinstance(public, str) or not re.fullmatch(r"[0-9a-f]{64}", public)
            or not isinstance(signature, str) or not re.fullmatch(r"[0-9a-f]{128}", signature)
            or not isinstance(owner_commitment, str) or not re.fullmatch(r"[0-9a-f]{64}", owner_commitment)):
        raise ValueError("Transfer approval has a malformed owner or signature")
    owner = bytes.fromhex(public)
    # This pin must come from the independently validated sender TIP registry,
    # never from the submitted approval. TIP's current hash is unsalted SHA-256.
    if hashlib.sha256(owner).hexdigest() != owner_commitment:
        raise ValueError("Transfer approval is not from the registered sender owner")
    try:
        VerifyKey(owner).verify(approval_message(commitment), bytes.fromhex(signature))
    except (BadSignatureError, ValueError) as error:
        raise ValueError("Transfer owner approval does not bind this intent") from error
