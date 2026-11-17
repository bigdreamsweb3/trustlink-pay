"""_assert_recipient_hash_matches_owner: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
import hmac
import re
from typing import Any, Callable, Protocol



def _assert_recipient_hash_matches_owner(recipient_hash: str, owner_pubkey_hash: str) -> None:
    normalized_recipient_hash = str(recipient_hash or "").strip().lower()
    normalized_owner_hash = str(owner_pubkey_hash or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", normalized_owner_hash):
        raise HTTPException(422, "Recipient TIP route has an invalid owner hash")
    if not re.fullmatch(r"[0-9a-f]{64}", normalized_recipient_hash):
        raise HTTPException(400, "recipientHash must be a 32-byte hexadecimal owner hash")
    if not hmac.compare_digest(normalized_recipient_hash, normalized_owner_hash):
        raise HTTPException(400, "recipientHash does not match the Node-resolved TIN owner hash")
