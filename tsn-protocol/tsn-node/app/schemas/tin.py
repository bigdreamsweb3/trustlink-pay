from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class TinOperationFeeRecord(BaseModel):
    intentId: str
    feeMint: str
    grossAmount: str
    verifierAmount: str
    submitterAmount: str
    teamAmount: str
    reservePoolAmount: str
    verifierPubkey: Optional[str] = None
    submitterPubkey: Optional[str] = None
    teamPubkey: Optional[str] = None
    reservePoolPubkey: Optional[str] = None
    feeCommitmentTx: Optional[str] = None
    feeCommitmentHash: str
    status: Literal["pending", "committed", "distributed", "failed"]
    createdAt: str
    updatedAt: str


class TinTcapRouteResponse(BaseModel):
    """Minimal TCap relationship metadata; no PRU inventory is exposed."""
    tin: str
    relationshipCommitment: str
    relationshipReference: str
    policyCommitment: str
    routeVersion: int
    status: Literal["finalized"]


class TinOperationRecord(BaseModel):
    intentId: str
    intentType: Literal["tin_creation", "tin_update"]
    tin: str
    ownerPubkey: str
    ownerSignature: Optional[str] = None
    ownerIntentHash: str
    ownerIntentMessage: Optional[str] = None
    nonce: str
    expiry: int
    createdAt: str
    updatedAt: str
    status: Literal[
        "pending_verification",
        "verifier_assigned",
        "verified",
        "fee_pending",
        "fee_committed",
        "submitter_assigned",
        "submitted_onchain",
        "finalized",
        "rejected",
        "expired",
        "failed",
    ]
    verifierCranker: Optional[str] = None
    submitterCranker: Optional[str] = None
    feeMetadata: Optional[TinOperationFeeRecord] = None
    failureReason: Optional[str] = None
    onchainSignatures: list[str] = Field(default_factory=list)
    displayName: Optional[str] = None
    encryptedMasterSeed: Optional[str] = None
    encryptedMetadataHash: str
    pruConfigurationHash: str
    pruCount: Optional[int] = None
    creationFeeAmount: Optional[str] = None
    updateFeeAmount: Optional[str] = None
    creationFeeMint: Optional[str] = None
    updateFeeMint: Optional[str] = None


class PublicTinOperationRecord(BaseModel):
    intentId: str
    intentType: str
    tin: str
    nonce: str
    expiry: int
    createdAt: str
    updatedAt: str
    status: str
    verifierCranker: Optional[str] = None
    submitterCranker: Optional[str] = None
    feeMetadata: Optional[TinOperationFeeRecord] = None
    failureReason: Optional[str] = None
    onchainSignatures: list[str] = Field(default_factory=list)
    displayName: Optional[str] = None


class TinOperationStageRequest(BaseModel):
    crankerPubkey: Optional[str] = None
    verifierCranker: Optional[str] = None
    submitterCranker: Optional[str] = None
    txSignature: Optional[str] = None
    onchainSignature: Optional[str] = None
    feeCommitmentTx: Optional[str] = None
    failureReason: Optional[str] = None
    reason: Optional[str] = None
