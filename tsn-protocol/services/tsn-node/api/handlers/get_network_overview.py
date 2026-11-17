"""get_network_overview: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from functools import partial
from .get_network_overview_key import get_network_overview_key
from datetime import datetime
from datetime import timezone
from core.schemas.network_overview_response import NetworkOverviewResponse
from core.schemas.token_network_status import TokenNetworkStatus
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    CRANKER_HEARTBEAT_TTL_SECS: Any
    get_supported_token_mints: Callable[..., Any]
    hget_all_json: Callable[..., Any]
    k_crankers: Callable[..., Any]
    k_intents: Callable[..., Any]
    logger: Any
    parse_iso: Callable[..., Any]
    read_public_vault_liquidity_cached: Callable[..., Any]


async def get_network_overview(node: Dependencies) -> NetworkOverviewResponse:
    supported_mints = node.get_supported_token_mints()
    intents = [
        intent for intent in await node.hget_all_json(node.k_intents())
        if intent.get("tokenMintAddress") in supported_mints
    ]
    heartbeat_records = await node.hget_all_json(node.k_crankers())
    now = datetime.now(timezone.utc)
    online_crankers = set()
    for record in heartbeat_records:
        operator_pubkey = record.get("operator_pubkey")
        last_seen_at = record.get("last_seen_at")
        if not operator_pubkey or not last_seen_at:
            continue
        try:
            if (now - node.parse_iso(str(last_seen_at))).total_seconds() <= node.CRANKER_HEARTBEAT_TTL_SECS:
                online_crankers.add(operator_pubkey)
        except ValueError:
            node.logger.warning("Ignoring cranker heartbeat with invalid last_seen_at=%s", last_seen_at)
    total_seen = {
        record.get("operator_pubkey")
        for record in heartbeat_records
        if record.get("operator_pubkey")
    }.union({intent.get("assignedCrankerPubkey") for intent in intents if intent.get("assignedCrankerPubkey")})

    by_mint: dict[str, dict[str, float]] = {}
    for intent in intents:
        mint = intent.get("tokenMintAddress")
        if not mint:
            continue
        bucket = by_mint.setdefault(mint, {"total": 0.0, "pending": 0.0, "executed": 0.0})
        amount = float(intent.get("amount") or 0)
        status = str(intent.get("status", "pending"))
        bucket["total"] += amount
        if status in ("executed", "settled", "completed"):
            bucket["executed"] += amount
        elif status == "pending":
            bucket["pending"] += amount

    vaults = await node.read_public_vault_liquidity_cached()
    token_rows: dict[str, TokenNetworkStatus] = {}
    for vault in vaults:
        mint = vault["token_mint"]
        amounts = by_mint.get(mint, {"total": 0.0, "pending": 0.0, "executed": 0.0})
        liquidity_units = float(vault.get("total_liquidity") or 0)
        liquidity_usd = float(vault.get("total_liquidity_usd") or 0)
        token_rows[mint] = TokenNetworkStatus(
            token_mint=mint,
            token_symbol=vault.get("token_symbol"),
            token_name=vault.get("token_name"),
            unit_price_usd=vault.get("unit_price_usd"),
            vault_token_account=vault.get("vault_token_account"),
            cranker_vault=vault.get("cranker_vault"),
            total_vault_liquidity_units=liquidity_units,
            total_vault_liquidity_usd=liquidity_usd,
            total_vault_liquidity=liquidity_usd,
            total_intent_amount=amounts["total"],
            pending_intent_amount=amounts["pending"],
            executed_intent_amount=amounts["executed"],
            vault_liquidity_estimate=liquidity_usd,
            liquidity_source="program_scan_epoch_cache",
        )

    for mint, amounts in by_mint.items():
        if mint in token_rows:
            continue
        token_rows[mint] = TokenNetworkStatus(
            token_mint=mint,
            total_vault_liquidity=0,
            total_vault_liquidity_units=0,
            total_vault_liquidity_usd=0,
            total_intent_amount=amounts["total"],
            pending_intent_amount=amounts["pending"],
            executed_intent_amount=amounts["executed"],
            vault_liquidity_estimate=0,
            liquidity_source="mempool_intents",
        )

    tokens = sorted(token_rows.values(), key=get_network_overview_key, reverse=True)
    return NetworkOverviewResponse(
        online_crankers_last_epoch=len(online_crankers),
        total_crankers_seen=len(total_seen),
        total_vault_liquidity_usd=sum(token.total_vault_liquidity_usd for token in tokens),
        total_vault_liquidity=sum(token.total_vault_liquidity_usd for token in tokens),
        tokens=tokens,
    )
