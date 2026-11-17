from __future__ import annotations

from fastapi import HTTPException
import base64
from app import config
from .get_private_replay_registry_pda import get_private_replay_registry_pda
from .solana_rpc import solana_rpc

async def read_private_replay_sequences() -> tuple[int, int]:
    rpc_response = await solana_rpc(
        "getAccountInfo",
        [str(get_private_replay_registry_pda()), {"encoding": "base64", "commitment": "confirmed"}],
    )
    value = rpc_response.get("result", {}).get("value")
    if not value:
        raise HTTPException(503, "TSN private replay registry is not initialized; rerun tsn:private:configure")
    encoded = ((value.get("data") or [None])[0])
    if not encoded:
        raise HTTPException(503, "TSN private replay registry data is unavailable")
    data = base64.b64decode(encoded)
    if len(data) < 57 or data[:8] != config.PRIVATE_REPLAY_REGISTRY_DISCRIMINATOR:
        raise HTTPException(503, "TSN private replay registry layout is invalid")
    return (
        int.from_bytes(data[40:48], "little"),
        int.from_bytes(data[48:56], "little"),
    )
