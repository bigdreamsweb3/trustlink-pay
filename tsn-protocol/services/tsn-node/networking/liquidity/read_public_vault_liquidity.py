"""read_public_vault_liquidity: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    get_token_account_balance_ui: Callable[..., Any]
    logger: Any
    read_onchain_cranker_vaults: Callable[..., Any]


async def read_public_vault_liquidity(node: Dependencies) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for vault in await node.read_onchain_cranker_vaults():
        balance_ui = 0.0
        decimals = 0
        try:
            balance_ui, decimals = await node.get_token_account_balance_ui(vault["vault_token_account"])
        except Exception:
            node.logger.exception("Could not read on-chain vault token balance for %s", vault["vault_token_account"])

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
            "withdrawable_liquidity_usd": max(
                0.0,
                balance_ui
                - float(vault.get("program_reserved_liquidity_base_units") or 0)
                / (10 ** decimals),
            ) * float(vault.get("unit_price_usd") or 0),
            "decimals": decimals,
        })
    return results
