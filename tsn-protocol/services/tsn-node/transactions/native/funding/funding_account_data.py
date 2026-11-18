"""Decode a required account with an exact owner and optional Anchor discriminator."""
from __future__ import annotations
import base64
import binascii
import hashlib
from typing import Any


def funding_account_data(account: Any, owner: str, minimum: int, name: str = "") -> bytes:
    try:
        if not isinstance(account, dict) or account.get("owner") != owner:
            raise ValueError("Owner mismatch")
        data = base64.b64decode(account["data"][0], validate=True)
        if len(data) < minimum or name and data[:8] != hashlib.sha256(("account:" + name).encode()).digest()[:8]:
            raise ValueError("Layout mismatch")
    except (KeyError, IndexError, TypeError, ValueError, binascii.Error) as exc:
        raise ValueError("TCAP funding account is missing or its owner/layout is invalid") from exc
    return data
