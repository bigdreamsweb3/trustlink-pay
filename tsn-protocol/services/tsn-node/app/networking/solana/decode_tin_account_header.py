from __future__ import annotations

from typing import Any

def decode_tin_account_header(data: bytes) -> dict[str, Any]:
    if len(data) < 8 + 4:
        raise ValueError("TINS account data is too short")
    offset = 0
    tin = int.from_bytes(data[offset:offset + 8], "little")
    offset += 8
    display_name_len = int.from_bytes(data[offset:offset + 4], "little")
    offset += 4
    if offset + display_name_len + 32 > len(data):
        raise ValueError("TINS account display name is invalid")
    display_name = data[offset:offset + display_name_len].decode("utf-8", errors="replace")
    offset += display_name_len
    owner_pubkey_hash = data[offset:offset + 32]
    return {
        "tin": str(tin),
        "displayName": display_name,
        "ownerPubkeyHash": owner_pubkey_hash.hex(),
    }
