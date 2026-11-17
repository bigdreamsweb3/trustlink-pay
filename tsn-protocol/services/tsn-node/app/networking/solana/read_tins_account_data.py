from __future__ import annotations

from typing import Optional
from app.solana_pubkey import Pubkey
import base64
import binascii
from app import config
from .solana_rpc import solana_rpc

async def read_tins_account_data(pubkey: Pubkey) -> Optional[bytes]:
    rpc_response = await solana_rpc(
        "getAccountInfo",
        [str(pubkey), {"encoding": "base64", "commitment": "confirmed"}],
    )
    value = rpc_response.get("result", {}).get("value")
    if not value or str(value.get("owner") or "") != config.TINS_PROGRAM_ID:
        return None
    encoded = ((value.get("data") or [None])[0])
    if not encoded:
        return None
    try:
        return base64.b64decode(encoded)
    except (binascii.Error, TypeError):
        return None
