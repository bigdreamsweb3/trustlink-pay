from __future__ import annotations
from pydantic import BaseModel
from core.schemas.token_network_status import TokenNetworkStatus

class NetworkOverviewResponse(BaseModel):
    online_crankers_last_epoch: int
    total_crankers_seen: int
    total_vault_liquidity_usd: float
    total_vault_liquidity: float
    tokens: list[TokenNetworkStatus]
