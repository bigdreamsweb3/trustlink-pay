from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class CrankerHeartbeatRequest(BaseModel):
    operator_pubkey: str = Field(...)
    cranker_pubkey: Optional[str] = Field(None)
    version: Optional[str] = Field(None)
    source: Optional[str] = Field(None)


class CrankerHeartbeatRecord(CrankerHeartbeatRequest):
    first_seen_at: str
    last_seen_at: str
    online: bool = True


class EpochStatus(BaseModel):
    epoch_number: int
    epoch_started_at: str
    next_close_at: str
    intent_count: int
    settlement_count: int


class EpochCloseResult(BaseModel):
    epoch_number: int
    intents_archived: int
    settlements_archived: int
    intents_rolled_over: int = 0
    intents_pruned: int = 0
    settlements_pruned: int = 0
    github_commit_url: str
    new_epoch_number: int
    message: str


class MempoolStatusRequest(BaseModel):
    action: Optional[str] = Field(default="status")


class MempoolStatusResponse(BaseModel):
    status: str = "ok"
    epoch: EpochStatus


class IntentToSettlementMetrics(BaseModel):
    sample_count: int
    average_ms: float
    min_ms: float
    max_ms: float
    last_ms: float
    updated_at: Optional[str] = None


class UptimeMetrics(BaseModel):
    service_started_at: str
    uptime_seconds: int
    uptime_days: float


class MetricsResponse(BaseModel):
    intent_to_settlement: IntentToSettlementMetrics
    uptime: UptimeMetrics
    active_crankers_last_epoch: int


class TokenNetworkStatus(BaseModel):
    token_mint: str
    token_symbol: Optional[str] = None
    token_name: Optional[str] = None
    unit_price_usd: Optional[float] = None
    vault_token_account: Optional[str] = None
    cranker_vault: Optional[str] = None
    total_vault_liquidity_units: float = 0
    total_liquidity_usd: float
    total_vault_liquidity: float = 0
    total_intent_amount: float
    pending_intent_amount: float
    executed_intent_amount: float
    vault_liquidity_estimate: float
    liquidity_source: str = "program_scan"


class NetworkOverviewResponse(BaseModel):
    online_crankers_last_epoch: int
    total_crankers_seen: int
    total_vault_liquidity_usd: float
    total_vault_liquidity: float
    tokens: list[TokenNetworkStatus]
