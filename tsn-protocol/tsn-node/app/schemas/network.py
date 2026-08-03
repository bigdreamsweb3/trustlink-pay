from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class RecoveryWorkItem(BaseModel):
    id: str
    paymentId: str
    transferId: str
    paymentIntentId: str
    settlementVault: str
    settlementTokenAccount: str
    tokenMintAddress: str
    settlementCrankerPubkey: str
    privacyVersion: Optional[int] = None
    amount: float
    epoch: int
    rewardLamports: int
    priorityScore: float
    status: Literal["pending", "leased", "completed", "failed", "canceled"] = "pending"
    assignedCrankerPubkey: Optional[str] = None
    leaseExpiresAt: Optional[str] = None
    recoveryTxSig: Optional[str] = None
    settlementReason: Optional[str] = None
    postedAt: str
    updatedAt: str
    recoverySequence: Optional[str] = None


class PublicRecoveryWorkItem(BaseModel):
    id: str
    tokenMintAddress: str
    privacyVersion: Optional[int] = None
    amount: float
    epoch: int
    rewardLamports: int
    priorityScore: float
    status: str
    recoveryTxSig: Optional[str] = None
    settlementReason: Optional[str] = None
    postedAt: str
    updatedAt: str


class RecoveryLeaseRequest(BaseModel):
    operatorPubkey: str


class PrivateRecoveryPermitResponse(BaseModel):
    permitSigner: str
    permitSignatureBase64: str
    recoveryNullifier: str
    recoverySequence: str
    escrowTokenAccount: str
    settlementCrankerPubkey: str
    tokenMintAddress: str
    recoveryAmountBaseUnits: str
    expiresAtTs: int


class RecoveryStatusRequest(BaseModel):
    status: str
    operatorPubkey: Optional[str] = None
    recoveryTxSig: Optional[str] = None
    settlementReason: Optional[str] = None


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
    claim_count: int
    proof_count: int
    recovery_count: int = 0


class EpochCloseResult(BaseModel):
    epoch_number: int
    intents_archived: int
    claims_archived: int
    proofs_archived: int
    recoveries_archived: int = 0
    intents_rolled_over: int = 0
    claims_rolled_over: int = 0
    intents_pruned: int = 0
    claims_pruned: int = 0
    proofs_pruned: int = 0
    recoveries_rolled_over: int = 0
    recoveries_pruned: int = 0
    github_commit_url: str
    new_epoch_number: int
    message: str


class MempoolStatusRequest(BaseModel):
    action: Optional[str] = Field(default="status")


class MempoolStatusResponse(BaseModel):
    status: str = "ok"
    epoch: EpochStatus


class IntentToClaimMetrics(BaseModel):
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
    intent_to_claim: IntentToClaimMetrics
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
