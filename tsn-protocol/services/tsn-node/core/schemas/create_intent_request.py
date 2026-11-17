from __future__ import annotations
from pydantic import BaseModel
from pydantic import ConfigDict
from pydantic import Field
from typing import Any
from typing import Literal
from typing import Optional

class CreateIntentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paymentId: str = Field(..., description="Unique payment ID")
    intentSeedHash: str = Field(..., description="SHA-256 hex of paymentId")
    recipientHash: str = Field(..., description="Hashed recipient")
    recipientTin: str = Field(..., description="Recipient TIN used for private settlement routing")
    tokenMintAddress: str = Field(..., description="SPL token mint address")
    amount: float = Field(..., description="Payment amount")
    senderWallet: str = Field(..., description="Wallet that signed the TSN payment authorization")
    senderAuthorizationMessage: str = Field(..., description="Canonical TSN payment authorization message")
    senderAuthorizationSignature: str = Field(..., description="Wallet signature over the authorization message")
    senderAuthorizationNonce: str = Field(..., description="Unique authorization nonce")
    senderAuthorizationIssuedAt: Optional[str] = Field(None, description="Authorization issue timestamp")
    senderAuthorizationExpiresAt: Optional[str] = Field(None, description="Authorization expiry timestamp")
    senderFeeAmount: Optional[float] = Field(None, description="Sender-side protocol fee routed to treasury")
    senderSignedFundingTransaction: str = Field(..., description="Owner-signed TCAP private funded-note deposit transaction")
    senderFundingMode: Literal["tcap_funded_note_v1"] = Field(..., description="Required proof-bound private funding authority model")
    fundingNote: dict[str, Any] = Field(..., repr=False, description="Private note opening restricted to Node verification")
    recipientAmount: Optional[float] = Field(None, description="Amount paid to recipient")
    destinationNetwork: Optional[str] = Field(None, description="Signed destination settlement network for cross-chain exits")
    destinationExecutor: Optional[str] = Field(None, description="Signed destination executor contract for cross-chain exits")
    destinationToken: Optional[str] = Field(None, description="Signed destination-chain ERC-20 settlement token")
    settlementRouteId: Optional[str] = Field(None, description="Signed registered TSN settlement route")
    source: Optional[str] = Field(None)
