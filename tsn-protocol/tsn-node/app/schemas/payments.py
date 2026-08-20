from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class CreateIntentRequest(BaseModel):
    paymentId: str = Field(..., description="Unique payment ID")
    intentSeedHash: str = Field(..., description="SHA-256 hex of paymentId")
    recipientHash: str = Field(..., description="Hashed recipient")
    recipientTin: Optional[str] = Field(None, description="Recipient TIN used by private settlement routing. Public responses do not expose it.")
    recipientRouteCommitment: str = Field(..., description="Finalized recipient PRU route commitment signed by the sender")
    recipientRouteVersion: int = Field(..., description="Finalized recipient PRU route version signed by the sender")
    tokenMintAddress: str = Field(..., description="SPL token mint address")
    amount: float = Field(..., description="Payment amount")
    recipientAmount: Optional[float] = Field(None, description="Amount paid to recipient; amount minus this is protocol fee")
    underlyingPayment: Optional[str] = Field(None, description="Protocol payment reference for the authorization")
    senderWallet: Optional[str] = Field(None, description="Wallet that signed the TSN payment authorization")
    senderAuthorizationMessage: Optional[str] = Field(None, description="Canonical TSN payment authorization message")
    senderAuthorizationSignature: Optional[str] = Field(None, description="Wallet signature over the authorization message")
    senderAuthorizationNonce: Optional[str] = Field(None, description="Unique authorization nonce")
    senderAuthorizationIssuedAt: Optional[str] = Field(None, description="Authorization issue timestamp")
    senderAuthorizationExpiresAt: Optional[str] = Field(None, description="Authorization expiry timestamp")
    senderFeeAmount: Optional[float] = Field(None, description="Sender-side protocol fee routed to treasury")
    senderSignedSettlementTransaction: Optional[str] = Field(None, description="Sender co-signed settlement transaction for cranker sponsorship")
    senderSignedSettlementFeePayer: Optional[str] = Field(None, description="Cranker fee payer expected to complete and broadcast the settlement")
    senderSettlementMode: Optional[str] = Field(None, description="Settlement authority model")
    pruSpendTin: Optional[str] = Field(None, description="TIN whose PRUs fund this intent")
    pruSpendAmountBaseUnits: Optional[str] = Field(None, description="Token units moved from PRUs into the epoch treasury")
    pruSpendSenderFeeBaseUnits: Optional[str] = Field(None, description="Token units moved from PRUs into the TSN treasury")
    walletTopUpAmountBaseUnits: Optional[str] = Field(None, description="Token units moved from the sender wallet into the epoch treasury")
    walletTopUpSenderFeeBaseUnits: Optional[str] = Field(None, description="Token units moved from the sender wallet into the TSN treasury")
    pruSpendSelections: Optional[list[dict]] = None
    encryptedSettlementToken: Optional[dict] = None
    commitmentHash: Optional[str] = None
    transferId: Optional[str] = None
    privacyVersion: Optional[int] = 1
    settlementEpoch: Optional[int] = None
    settlementResolution: Optional[str] = None
    settlementReason: Optional[str] = None
    source: Optional[str] = None


class MempoolIntent(CreateIntentRequest):
    id: str
    status: str
    assignedCrankerPubkey: Optional[str] = None
    fundingTxSig: Optional[str] = None
    settlementTxSig: Optional[str] = None
    settlementResolution: Optional[str] = None
    settlementReason: Optional[str] = None
    postedAt: str
    updatedAt: str


class PublicMempoolIntent(BaseModel):
    id: str
    paymentId: str
    intentSeedHash: str
    recipientHash: str
    tokenMintAddress: str
    amount: float
    recipientAmount: Optional[float] = None
    privacyVersion: Optional[int] = None
    source: Optional[str] = None
    status: str
    assignedCrankerPubkey: Optional[str] = None
    fundingTxSig: Optional[str] = None
    settlementTxSig: Optional[str] = None
    settlementResolution: Optional[str] = None
    settlementReason: Optional[str] = None
    postedAt: str
    updatedAt: str


class IntentWorkItem(BaseModel):
    intent: MempoolIntent


class UpdateStatusRequest(BaseModel):
    status: str = Field(...)
    assignedCrankerPubkey: Optional[str] = Field(None)
    fundingTxSig: Optional[str] = Field(None)
    settlementTxSig: Optional[str] = Field(None)
    settlementResolution: Optional[str] = Field(None)
    settlementReason: Optional[str] = Field(None)


class SignedLeasePermitRequest(BaseModel):
    operatorPubkey: str
    requestedAtTs: int
    requestSignatureBase64: str


class PrivatePayoutPermitResponse(BaseModel):
    permitSigner: str
    permitSignatureBase64: str
    payoutNullifier: str
    tokenMintAddress: str
    recipientWallet: str
    payoutAmountBaseUnits: str
    claimFeeAmountBaseUnits: str
    commitmentHash: str
    epochTreasury: str
    epochLedger: str
    claimSlot: str
    settlementDna: str
    commitmentDigest: str
    randomNonce: str
    settlementCommitment: str
    leaseId: str
    leaseVersion: int
    leaseExpiresAt: str
    expiresAtTs: int


class PruSpendPermitSelection(BaseModel):
    tin: str
    pruIndex: int
    nonce: int
    publicKey: str
    spendAuthHash: str
    amountBaseUnits: str


class PruSpendPermitResponse(BaseModel):
    paymentId: str
    tokenMintAddress: str
    commitmentHash: str
    fundingAmountBaseUnits: str
    senderFeeAmountBaseUnits: str
    selections: list[PruSpendPermitSelection]
