"""resolve_tin_identity_for_verification: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException
from typing import Any
from typing import Optional
import binascii
import hashlib
import json
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TINS_LOOKUP_SECRET: Any
    decode_private_tin_route_material: Callable[..., Any]
    get_private_tin_pda: Callable[..., Any]
    read_tins_account_data: Callable[..., Any]


async def resolve_tin_identity_for_verification(node: Dependencies, tin: str) -> Optional[dict[str, Any]]:
    """Open the private identity envelope for Node-side work verification."""
    try:
        material = node.decode_private_tin_route_material(await node.read_tins_account_data(node.get_private_tin_pda(tin)) or b"")
        envelope = bytes(material["identityEnvelope"])
        if len(envelope) < 13:
            return None
        key = hashlib.sha256(b"TSN_TIN_V1_IDENTITY" + node.TINS_LOOKUP_SECRET.encode("utf-8") + str(tin).encode("utf-8")).digest()
        plaintext = AESGCM(key).decrypt(envelope[:12], envelope[12:], None)
        identity = json.loads(plaintext.decode("utf-8"))
        if str(identity.get("tin")) != str(tin) or not isinstance(identity.get("name"), str):
            return None
        return {
            "displayName": identity["name"],
            "ownerPubkeyHash": str(material["ownerPubkeyHash"]),
            # Credentials must come from Node-validated identity data, never from sender input.
            "verifiedCredentials": [],
        }
    except (HTTPException, InvalidTag, ValueError, TypeError, KeyError, binascii.Error, json.JSONDecodeError):
        return None
