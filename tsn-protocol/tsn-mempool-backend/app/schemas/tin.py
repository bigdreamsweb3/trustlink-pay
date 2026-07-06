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


class TinPruPublicAddress(BaseModel):
    index: int
    publicKey: str
    state: str


class TinPruRoutePublicResponse(BaseModel):
    tin: str
    pruConfigurationHash: str
    status: Literal["finalized"]
    prus: list[TinPruPublicAddress]


class TinPruRouteSessionRequest(BaseModel):
    tin: str
    owner_pubkey: str
    signature: str
    nonce: str
    timestamp: int
    signed_message_base64: Optional[str] = None


class TinPruRouteSessionResponse(BaseModel):
    token: str
    expiresAt: int
    tin: str


class TinDelegatedReadRequest(BaseModel):
    tin: str
    owner_pubkey: str
    platform_read_key: str
    signature: str
    nonce: str
    timestamp: int
    expiry: Optional[int] = None
    signed_message_base64: Optional[str] = None


class TinDelegatedReadResponse(BaseModel):
    tin: str
    platformReadKey: str
    expiresAt: Optional[int] = None
    status: Literal["active", "revoked"]


class TinDelegatedPlatformRecord(BaseModel):
    platformReadKey: str
    contact: Optional[str] = None
    expiresAt: int


class PlatformReadKeyRegistrationRequest(BaseModel):
    platform_read_key: str
    contact: str


class PlatformReadKeyRegistrationResponse(BaseModel):
    platformReadKey: str
    contact: str
    status: Literal["registered"]


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
