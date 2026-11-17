"""read_public_vault_liquidity_cached: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
import time
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    VAULT_LIQUIDITY_REFRESH_SECS: Any
    _vault_liquidity_cache: Any
    _vault_liquidity_lock: Any
    logger: Any
    read_epoch_state: Callable[..., Any]
    read_public_vault_liquidity: Callable[..., Any]


async def read_public_vault_liquidity_cached(node: Dependencies) -> list[dict[str, Any]]:
    """Read vault liquidity from Solana RPC at most once per epoch by default."""
    pass  # Mutable state belongs to the explicit Node runtime.

    state = await node.read_epoch_state()
    epoch_number = int(state["epoch_number"])
    now = time.monotonic()
    cached = node._vault_liquidity_cache

    if (
        cached
        and cached.get("epoch_number") == epoch_number
        and now - float(cached.get("loaded_at", 0)) < node.VAULT_LIQUIDITY_REFRESH_SECS
    ):
        return list(cached.get("vaults") or [])

    async with node._vault_liquidity_lock:
        now = time.monotonic()
        cached = node._vault_liquidity_cache
        if (
            cached
            and cached.get("epoch_number") == epoch_number
            and now - float(cached.get("loaded_at", 0)) < node.VAULT_LIQUIDITY_REFRESH_SECS
        ):
            return list(cached.get("vaults") or [])

        vaults = await node.read_public_vault_liquidity()
        node._vault_liquidity_cache = {
            "epoch_number": epoch_number,
            "loaded_at": now,
            "vaults": vaults,
        }
        node.logger.info(
            "vault.liquidity.refreshed epoch=%s vaults=%s next_refresh_secs=%s",
            epoch_number,
            len(vaults),
            node.VAULT_LIQUIDITY_REFRESH_SECS,
        )
        return list(vaults)
