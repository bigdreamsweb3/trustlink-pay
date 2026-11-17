"""read_funding_root implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from settlement.funding.funding_contract import Rpc
from settlement.funding.funding_contract import TCAP_PROGRAM
from settlement.funding.decode_funding_root import decode_funding_root
from settlement.funding.funding_root_address import funding_root_address

async def read_funding_root(rpc: Rpc, program: str = TCAP_PROGRAM) -> dict[str, Any]:
    address, _ = funding_root_address(program)
    response = await rpc("getAccountInfo", [str(address), {"encoding": "base64", "commitment": "confirmed"}])
    result = response.get("result") or {}
    decoded = decode_funding_root(result.get("value"), program)
    return {**decoded, "address": str(address), "slot": int((result.get("context") or {}).get("slot") or 0)}
