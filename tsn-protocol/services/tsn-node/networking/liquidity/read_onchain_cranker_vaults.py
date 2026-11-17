"""read_onchain_cranker_vaults: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
import base64
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    CRANKER_VAULT_ACCOUNT_SIZE: Any
    CRANKER_VAULT_DISCRIMINATOR: Any
    encode_base58: Callable[..., Any]
    get_program_accounts: Callable[..., Any]
    get_supported_token_metadata: Callable[..., Any]


async def read_onchain_cranker_vaults(node: Dependencies) -> list[dict[str, Any]]:
    """Discover CrankerVault accounts from the TSN program and read their public fields."""
    accounts = await node.get_program_accounts(node.CRANKER_VAULT_ACCOUNT_SIZE)
    results: list[dict[str, Any]] = []
    supported_metadata = node.get_supported_token_metadata()
    supported_mints = set(supported_metadata.keys())
    for account in accounts:
        encoded = (((account.get("account") or {}).get("data") or [None])[0])
        if not encoded:
            continue
        try:
            data = base64.b64decode(encoded)
        except Exception:
            continue
        if len(data) != node.CRANKER_VAULT_ACCOUNT_SIZE or data[:8] != node.CRANKER_VAULT_DISCRIMINATOR:
            continue
        mother_escrow = node.encode_base58(data[8:40])
        cranker = node.encode_base58(data[40:72])
        mint = node.encode_base58(data[72:104])
        token_account = node.encode_base58(data[104:136])
        if supported_mints and mint not in supported_mints:
            continue
        total_liquidity_base_units = int.from_bytes(data[137:145], "little")
        total_shares = int.from_bytes(data[145:153], "little")
        reserved_liquidity_base_units = int.from_bytes(data[153:161], "little")
        total_withdrawn_base_units = int.from_bytes(data[161:169], "little")
        total_rewards_base_units = int.from_bytes(data[169:177], "little")
        metadata = supported_metadata.get(mint, {})
        results.append({
            "cranker_vault": account.get("pubkey"),
            "mother_escrow": mother_escrow,
            "cranker": cranker,
            "token_mint": mint,
            "token_symbol": metadata.get("symbol") or mint[:6].upper(),
            "token_name": metadata.get("name") or metadata.get("symbol") or "Token",
            "unit_price_usd": metadata.get("unit_price_usd"),
            "vault_token_account": token_account,
            "program_total_liquidity_base_units": total_liquidity_base_units,
            "program_total_shares": total_shares,
            "program_reserved_liquidity_base_units": reserved_liquidity_base_units,
            "program_withdrawable_liquidity_base_units": max(
                0, total_liquidity_base_units - reserved_liquidity_base_units
            ),
            "program_total_withdrawn_base_units": total_withdrawn_base_units,
            "program_total_rewards_base_units": total_rewards_base_units,
        })
    return results
