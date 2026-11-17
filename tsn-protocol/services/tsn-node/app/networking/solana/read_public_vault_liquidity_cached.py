from __future__ import annotations

from typing import Any
from app import config
from .read_public_vault_liquidity import read_public_vault_liquidity
import time

async def read_public_vault_liquidity_cached() -> list[dict[str, Any]]:
    from app.storage.mempool.read_epoch_state import read_epoch_state

    state = await read_epoch_state()
    epoch_number = int(state["epoch_number"])
    now = time.monotonic()
    cached = config._vault_liquidity_cache
    if cached and cached.get("epoch_number") == epoch_number and now - float(cached.get("loaded_at", 0)) < config.VAULT_LIQUIDITY_REFRESH_SECS:
        return list(cached.get("vaults") or [])
    async with config._vault_liquidity_lock:
        now = time.monotonic()
        cached = config._vault_liquidity_cache
        if cached and cached.get("epoch_number") == epoch_number and now - float(cached.get("loaded_at", 0)) < config.VAULT_LIQUIDITY_REFRESH_SECS:
            return list(cached.get("vaults") or [])
        vaults = await read_public_vault_liquidity()
        config._vault_liquidity_cache = {"epoch_number": epoch_number, "loaded_at": now, "vaults": vaults}
        config.logger.info(
            "vault.liquidity.refreshed epoch=%s vaults=%s next_refresh_secs=%s",
            epoch_number,
            len(vaults),
            config.VAULT_LIQUIDITY_REFRESH_SECS,
        )
        return list(vaults)
