"""get_network_overview_key: isolated helper; captured dependencies are explicit arguments."""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from core.schemas.network_overview_response import NetworkOverviewResponse
from core.schemas.token_network_status import TokenNetworkStatus
from typing import Any, Protocol
class Dependencies(Protocol):
    CRANKER_HEARTBEAT_TTL_SECS: Any
    get_supported_token_mints: Any
    hget_all_json: Any
    k_crankers: Any
    k_intents: Any
    logger: Any
    parse_iso: Any
    read_public_vault_liquidity_cached: Any

def get_network_overview_key(token):
    return token.total_vault_liquidity_usd
