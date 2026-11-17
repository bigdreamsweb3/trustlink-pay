from __future__ import annotations

import base64
import binascii
from app import config
from .get_mother_escrow_pda import get_mother_escrow_pda
import httpx
from .solana_rpc import solana_rpc
import time

async def read_tin_fee_config() -> dict[str, int]:
    now = time.time()
    if config._tin_fee_config_cache and config._tin_fee_config_cache_expires_at > now:
        return dict(config._tin_fee_config_cache)
    try:
        rpc_response = await solana_rpc(
            "getAccountInfo",
            [str(get_mother_escrow_pda()), {"encoding": "base64", "commitment": "confirmed"}],
        )
        value = rpc_response.get("result", {}).get("value")
        encoded = ((value.get("data") or [None])[0]) if value else None
        if encoded:
            data = base64.b64decode(encoded)
            minimum_length = 8 + 32 + 32 + 32 + 8 + 8 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 8 + 8 + 1
            if len(data) >= minimum_length:
                offset = 8 + 32 + 32 + 32 + 8 + 8 + 2 + 2 + 2
                config._tin_fee_config_cache = {
                    "verifier": int.from_bytes(data[offset:offset + 2], "little"),
                    "submitter": int.from_bytes(data[offset + 2:offset + 4], "little"),
                    "team": int.from_bytes(data[offset + 4:offset + 6], "little"),
                    "reserve_pool": int.from_bytes(data[offset + 6:offset + 8], "little"),
                }
                config._tin_fee_config_cache_expires_at = now + 60
                return dict(config._tin_fee_config_cache)
    except (httpx.HTTPError, ValueError, binascii.Error):
        pass
    config._tin_fee_config_cache = dict(config.TIN_FEE_SPLIT_BPS)
    config._tin_fee_config_cache_expires_at = now + 15
    return dict(config.TIN_FEE_SPLIT_BPS)
