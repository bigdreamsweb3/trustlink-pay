from __future__ import annotations

from typing import Any
from app import config
from .get_token_account_balance_ui import get_token_account_balance_ui
from .read_onchain_cranker_vaults import read_onchain_cranker_vaults

async def read_public_vault_liquidity() -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for vault in await read_onchain_cranker_vaults():
        balance_ui = 0.0
        decimals = 0
        try:
            balance_ui, decimals = await get_token_account_balance_ui(vault["vault_token_account"])
        except Exception:
            config.logger.exception("Could not read on-chain vault token balance for %s", vault["vault_token_account"])
        results.append({
            **vault,
            "total_liquidity": balance_ui,
            "total_liquidity_usd": balance_ui * float(vault.get("unit_price_usd") or 0),
            "withdrawable_liquidity": max(
                0.0,
                balance_ui
                - float(vault.get("program_reserved_liquidity_base_units") or 0)
                / (10 ** decimals),
            ),
            "decimals": decimals,
        })
    return results
