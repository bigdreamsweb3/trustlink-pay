"""read_tins_account_data: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from typing import Optional
import base64
import binascii
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TINS_PROGRAM_ID: Any
    solana_rpc: Callable[..., Any]


async def read_tins_account_data(node: Dependencies, pubkey: Pubkey) -> Optional[bytes]:
    rpc_response = await node.solana_rpc(
        "getAccountInfo",
        [
            str(pubkey),
            {"encoding": "base64", "commitment": "confirmed"},
        ],
    )
    value = rpc_response.get("result", {}).get("value")
    if not value:
        return None
    if str(value.get("owner") or "") != node.TINS_PROGRAM_ID:
        return None
    encoded = ((value.get("data") or [None])[0])
    if not encoded:
        return None
    try:
        return base64.b64decode(encoded)
    except (binascii.Error, TypeError):
        return None
