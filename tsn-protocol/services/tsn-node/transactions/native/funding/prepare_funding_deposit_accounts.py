"""Read TCAP deposit accounts and advisory wallet balance before any blockhash is issued.

Uses registered asset metadata and the unchanged nine-account deposit ABI. These
checks reserve no funds; final simulation and the chain enforce execution state.
"""
from __future__ import annotations
from typing import Any, Callable, Protocol
from fastapi import HTTPException
from app.solana_pubkey import Pubkey
from .funding_account_data import funding_account_data
from settlement.funding.decode_funding_root import decode_funding_root


class Dependencies(Protocol):
    TCAP_PROGRAM_ID: str
    solana_rpc: Callable[..., Any]
    funding_root_address: Callable[..., Any]


async def prepare_funding_deposit_accounts(node: Dependencies, request: Any, verified: dict[str, Any], amount: int) -> dict[str, str]:
    program = Pubkey.from_string(node.TCAP_PROGRAM_ID)
    config, _ = Pubkey.find_program_address([b"tcap:global-config:v1"], program)
    entry_address = verified["tcapAssetEntry"]
    response = await node.solana_rpc("getAccountInfo", [entry_address, {"encoding": "base64", "commitment": "confirmed"}])
    if response.get("error"):
        raise HTTPException(503, "TCAP funding account lookup is unavailable")
    entry = funding_account_data((response.get("result") or {}).get("value"), node.TCAP_PROGRAM_ID, 287, "TcapAssetEntryV1")
    reserve = str(Pubkey(entry[148:180]))
    vault = str(Pubkey(entry[180:212]))
    authority = entry[212:244]
    if (entry[80:112] != bytes(Pubkey.from_string(request.tokenMintAddress))
        or entry[48:80] != bytes(Pubkey.from_string(verified["tokenProgram"]))
        or entry[245] != 1 or entry[247] != 0 or entry[283:286] != b"\x01\x01\x00"
        or not any(authority)):
        raise ValueError("TCAP funding asset is unavailable or differs from the signed intent")
    root = str(node.funding_root_address(node.TCAP_PROGRAM_ID)[0])
    response = await node.solana_rpc("getMultipleAccounts", [[str(config), reserve, vault, root], {"encoding": "base64", "commitment": "confirmed"}])
    values = (response.get("result") or {}).get("value")
    if response.get("error") or not isinstance(values, list) or len(values) != 4:
        raise HTTPException(503, "TCAP funding account lookup is unavailable")
    config_data = funding_account_data(values[0], node.TCAP_PROGRAM_ID, 244, "TcapGlobalConfigV1")
    reserve_data = funding_account_data(values[1], node.TCAP_PROGRAM_ID, 201, "TcapReserveStateV1")
    vault_data = funding_account_data(values[2], verified["tokenProgram"], 165)
    decode_funding_root(values[3], node.TCAP_PROGRAM_ID)
    if (config_data[207] != 0 or reserve_data[188:190] != b"\x01\x00"
        or reserve_data[44:76] != bytes(Pubkey.from_string(entry_address))
        or reserve_data[76:108] != bytes(Pubkey.from_string(vault))
        or reserve_data[108:140] != authority
        or vault_data[:32] != bytes(Pubkey.from_string(request.tokenMintAddress))
        or vault_data[32:64] != authority or vault_data[108] != 1
        or reserve_data[140:148] != vault_data[64:72]):
        raise ValueError("TCAP funding reserve, vault, or configuration is unavailable")
    response = await node.solana_rpc("getTokenAccountsByOwner", [request.senderWallet, {"mint": request.tokenMintAddress}, {"encoding": "base64", "commitment": "confirmed"}])
    values = (response.get("result") or {}).get("value")
    if response.get("error") or not isinstance(values, list):
        raise HTTPException(503, "Wallet token balance lookup is unavailable")
    selected = None
    best_balance = -1
    for value in values:
        try:
            data = funding_account_data(value.get("account"), verified["tokenProgram"], 165)
            balance = int.from_bytes(data[64:72], "little")
            if (data[:32] == bytes(Pubkey.from_string(request.tokenMintAddress))
                and data[32:64] == bytes(Pubkey.from_string(request.senderWallet))
                and data[108] == 1 and balance >= amount and balance > best_balance):
                selected = str(Pubkey.from_string(value["pubkey"]))
                best_balance = balance
        except (ValueError, TypeError, KeyError):
            continue
    if not selected:
        raise ValueError("Wallet has no active token account with sufficient funds for this payment")
    return {"depositor": request.senderWallet, "tcapProgramId": node.TCAP_PROGRAM_ID,
        "config": str(config), "assetEntry": entry_address, "reserveState": reserve,
        "source": selected, "vault": vault, "mint": request.tokenMintAddress,
        "tokenProgram": verified["tokenProgram"], "fundingRootAccount": root}
