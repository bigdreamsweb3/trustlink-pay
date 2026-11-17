"""read_accounts implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from app.solana_pubkey import Pubkey
from settlement.tip.tip_contract import Rpc
from settlement.tip.tip_contract import TIP
import base64

async def read_accounts(rpc: Rpc, addresses: list[str], min_slot: int | None = None, tip_program: Pubkey = TIP) -> tuple[int, list[bytes]]:
    config: dict[str, Any] = {"encoding": "base64", "commitment": "confirmed"}
    if min_slot is not None:
        config["minContextSlot"] = min_slot
    document = await rpc("getMultipleAccounts", [addresses, config])
    result = document.get("result") or {}
    values, slot = result.get("value"), (result.get("context") or {}).get("slot")
    if (document.get("error") or not isinstance(values, list) or len(values) != len(addresses)
            or type(slot) is not int or slot < (min_slot or 0)):
        raise RuntimeError("GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE: TIP confirmed account batch is unavailable")
    decoded = []
    for value in values:
        if (not isinstance(value, dict) or value.get("owner") != str(tip_program) or value.get("executable") is not False
                or not isinstance(value.get("data"), list) or len(value["data"]) != 2 or value["data"][1] != "base64"):
            raise ValueError("TIP confirmed account owner or encoding is invalid")
        decoded.append(base64.b64decode(value["data"][0], validate=True))
    return slot, decoded
