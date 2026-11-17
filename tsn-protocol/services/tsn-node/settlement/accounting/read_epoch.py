"""read_epoch implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from security.cryptography.gpru_contract import BABYJUB_FIELD
from app.solana_pubkey import Pubkey
from settlement.funding.funding_contract import TCAP_PROGRAM
import base64
import hashlib
from settlement.witness.hex_field import hex_field

async def read_epoch(rpc, asset: str, reserve: str) -> dict:
    response = await rpc("getAccountInfo", [reserve, {"encoding": "base64", "commitment": "confirmed"}])
    account = (response.get("result") or {}).get("value")
    if not isinstance(account, dict) or account.get("owner") != TCAP_PROGRAM:
        raise ValueError("TCAP_CREDIT_RESERVE_INVALID")
    data = base64.b64decode(account["data"][0], validate=True)
    if (len(data) != 201 or data[:8] != hashlib.sha256(b"account:TcapReserveStateV1").digest()[:8]
        or data[44:76] != bytes(Pubkey.from_string(asset)) or data[189] != 0):
        raise ValueError("TCAP_CREDIT_RESERVE_INVALID")
    number = int.from_bytes(data[180:188], "little")
    address, bump = Pubkey.find_program_address([b"tcap:credit-epoch:v1", bytes(Pubkey.from_string(asset)), number.to_bytes(8, "little")], Pubkey.from_string(TCAP_PROGRAM))
    response = await rpc("getAccountInfo", [str(address), {"encoding": "base64", "commitment": "confirmed"}])
    account = (response.get("result") or {}).get("value")
    seed = hex_field(int.from_bytes(hashlib.sha256(b"TSN_TCAP_CREDIT_EPOCH_V1\0" + bytes(address)).digest(), "big") % BABYJUB_FIELD)
    result = {"address": str(address), "asset": asset, "number": number, "seed": seed, "digest": seed, "count": 0, "started": 0}
    if account is None:
        return result
    if account.get("owner") != TCAP_PROGRAM:
        raise ValueError("TCAP_CREDIT_EPOCH_INVALID")
    data = base64.b64decode(account["data"][0], validate=True)
    if (len(data) != 136 or data[:8] != hashlib.sha256(b"account:TcapCreditEpochV1").digest()[:8]
        or data[8:10] != b"\x01\x00" or data[10] != bump or data[11:43] != bytes(Pubkey.from_string(asset))
        or int.from_bytes(data[43:51], "little") != number or data[55:87].hex() != seed or data[135] != 0):
        raise ValueError("TCAP_CREDIT_EPOCH_INVALID")
    result.update(token=int.from_bytes(data[51:55], "little"), digest=data[87:119].hex(), count=int.from_bytes(data[119:127], "little"), started=int.from_bytes(data[127:135], "little"))
    if not 0 <= result["count"] <= 64 or int(result["digest"], 16) >= BABYJUB_FIELD:
        raise ValueError("TCAP_CREDIT_EPOCH_INVALID")
    return result
