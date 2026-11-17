from __future__ import annotations
from pydantic import BaseModel
from typing import Optional

class TokenNetworkStatus(BaseModel):
    token_mint: str
    token_symbol: Optional[str] = None
    token_name: Optional[str] = None
    unit_price_usd: Optional[float] = None
    vault_token_account: Optional[str] = None
    cranker_vault: Optional[str] = None
    total_vault_liquidity_units: float = 0
    total_vault_liquidity_usd: float = 0
    total_vault_liquidity: float = 0
    total_intent_amount: float
    pending_intent_amount: float
    executed_intent_amount: float
    vault_liquidity_estimate: float
    liquidity_source: str = "program_scan"
