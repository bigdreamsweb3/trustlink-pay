from __future__ import annotations

from typing import Any
from typing import Optional
from app.utils.encoding import decode_base58
from .decode_tin_account_header import decode_tin_account_header
from .get_tins_identity_pda import get_tins_identity_pda
import hashlib
from .read_tins_account_data import read_tins_account_data

async def verify_onchain_tin_for_shadow_import(operation: dict[str, Any]) -> Optional[dict[str, Any]]:
    identity_pubkey = get_tins_identity_pda(str(operation["ownerPubkey"]))
    data = await read_tins_account_data(identity_pubkey)
    if not data:
        return None
    try:
        decoded = decode_tin_account_header(data)
    except ValueError:
        return None
    if decoded["tin"] != str(operation["tin"]):
        return None
    owner_pubkey_bytes = decode_base58(str(operation["ownerPubkey"]))
    expected_owner_hash = hashlib.sha256(owner_pubkey_bytes).hexdigest()
    legacy_owner_marker = owner_pubkey_bytes.hex()
    legacy_identity_marker = decode_base58(str(identity_pubkey)).hex()
    owner_pubkey_hash = str(decoded.get("ownerPubkeyHash") or "")
    if owner_pubkey_hash not in {expected_owner_hash, legacy_owner_marker, legacy_identity_marker}:
        return None
    return {
        "tin": decoded["tin"],
        "ownerPubkey": operation["ownerPubkey"],
        "identityPubkey": str(identity_pubkey),
        "ownerPubkeyHash": owner_pubkey_hash,
        "displayName": decoded["displayName"],
        "settlementAuthority": None,
        "settlementAuthorityVerified": False,
    }
