"""resolve_debit_asset: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from typing import Any
import base64
import binascii
import hashlib
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TCAP_PROGRAM_ID: Any
    TOKEN_2022_PROGRAM_ID: Any
    TOKEN_PROGRAM_ID: Any
    solana_rpc: Callable[..., Any]


async def resolve_debit_asset(node: Dependencies, mint_address: str) -> dict[str, Any]:
    """Resolve debit eligibility; deposits_enabled is irrelevant to ownership changes."""
    try:
        mint = Pubkey.from_string(mint_address)
    except ValueError as exc:
        raise ValueError("Token mint address is invalid") from exc
    mint_response = await node.solana_rpc("getAccountInfo", [str(mint), {"encoding": "base64", "commitment": "confirmed"}])
    mint_account = ((mint_response.get("result") or {}).get("value"))
    if not isinstance(mint_account, dict):
        raise ValueError("Token mint account is not present on the configured Solana cluster")
    try:
        token_program = Pubkey.from_string(str(mint_account.get("owner") or ""))
        mint_data = base64.b64decode((mint_account.get("data") or [None])[0], validate=True)
    except (ValueError, TypeError, binascii.Error) as exc:
        raise ValueError("Token mint account owner or data is invalid") from exc
    if token_program not in (node.TOKEN_PROGRAM_ID, node.TOKEN_2022_PROGRAM_ID) or len(mint_data) < 45:
        raise ValueError("Token mint is not a supported SPL Token or Token-2022 mint")
    mint_decimals = mint_data[44]
    tcap_program = Pubkey.from_string(node.TCAP_PROGRAM_ID)
    registry, _ = Pubkey.find_program_address([b"tcap:asset-registry:v1"], tcap_program)
    asset_entry, _ = Pubkey.find_program_address(
        [b"tcap:asset-entry:v1", bytes(registry), bytes(token_program), bytes(mint)], tcap_program,
    )
    entry_response = await node.solana_rpc("getAccountInfo", [str(asset_entry), {"encoding": "base64", "commitment": "confirmed"}])
    entry = ((entry_response.get("result") or {}).get("value"))
    if not isinstance(entry, dict) or str(entry.get("owner") or "") != node.TCAP_PROGRAM_ID:
        raise ValueError("Token mint is not registered in TCAP")
    try:
        entry_data = base64.b64decode((entry.get("data") or [None])[0], validate=True)
    except (ValueError, TypeError, binascii.Error) as exc:
        raise ValueError("TCAP asset entry data is invalid") from exc
    expected_discriminator = hashlib.sha256(b"account:TcapAssetEntryV1").digest()[:8]
    if (len(entry_data) < 287 or entry_data[:8] != expected_discriminator
        or entry_data[8:12] != b"\x01\x00\x01\x00"):
        raise ValueError("TCAP asset entry layout is unsupported")
    if (
        entry_data[12:44] != bytes(registry)
        or entry_data[48:80] != bytes(token_program)
        or entry_data[80:112] != bytes(mint)
    ):
        raise ValueError("TCAP asset entry does not bind the requested mint and token program")
    token_id = int.from_bytes(entry_data[44:48], "little")
    decimals = entry_data[244]
    if (
        token_id <= 0 or decimals > 18 or decimals != mint_decimals
        or entry_data[247] != 0
        or entry_data[283] != 1 or entry_data[284] != 1 or entry_data[285] != 0
    ):
        raise ValueError("TCAP asset is not active for TIN-Debit or its mint decimals do not match")
    return {
        "assetEntry": str(asset_entry), "tokenId": token_id, "mint": str(mint),
        "tokenProgram": str(token_program), "decimals": decimals,
    }
