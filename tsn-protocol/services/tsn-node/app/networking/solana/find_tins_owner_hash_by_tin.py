from __future__ import annotations

from typing import Optional
import base64
import binascii
from app import config
from .decode_tin_account_header import decode_tin_account_header
from .solana_rpc import solana_rpc

async def find_tins_owner_hash_by_tin(tin: str) -> Optional[str]:
    rpc_response = await solana_rpc(
        "getProgramAccounts",
        [config.TINS_PROGRAM_ID, {"encoding": "base64", "commitment": "confirmed"}],
    )
    for account in rpc_response.get("result") or []:
        encoded = (((account.get("account") or {}).get("data") or [None])[0])
        if not encoded:
            continue
        try:
            decoded = decode_tin_account_header(base64.b64decode(encoded))
        except (ValueError, binascii.Error, TypeError):
            continue
        if str(decoded.get("tin")) == str(tin):
            return str(decoded.get("ownerPubkeyHash") or "").lower()
    return None
