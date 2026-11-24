"""Private sender-approved TIN-Debit ingress fields."""
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal


class TinDebitIdentityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    senderTin: str = Field(pattern=r"^\d{10}$")
    recipientTin: str = Field(pattern=r"^\d{10}$")
    tokenMintAddress: str = Field(min_length=32, max_length=44)


class TinDebitPrepareRequest(TinDebitIdentityRequest):
    ownerPublicKey: str = Field(pattern=r"^[0-9a-f]{64}$")
    signature: str = Field(pattern=r"^[0-9a-f]{128}$", repr=False)
    expiresAt: str = Field(pattern=r"^[1-9][0-9]{0,12}$")


class TinDebitApproval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ownerPublicKey: str = Field(pattern=r"^[0-9a-f]{64}$")
    signature: str = Field(pattern=r"^[0-9a-f]{128}$", repr=False)


class TinDebitOpening(TinDebitApproval):
    version: Literal[1]
    recordType: Literal["tsn-gpru-tin-debit-opening-v1"]
    leg: Literal[0]
    authorizationCommitment: str = Field(pattern=r"^[0-9a-f]{64}$")
    routeKeyCommitment: str = Field(pattern=r"^[0-9a-f]{64}$")
    tokenId: int = Field(strict=True, gt=0, le=4294967295)
    sequence: str = Field(pattern=r"^(0|[1-9][0-9]{0,19})$")
    previousMemoCommitment: str = Field(pattern=r"^[0-9a-f]{64}$")
    balance: str = Field(pattern=r"^(0|[1-9][0-9]{0,38})$", repr=False)
    blinding: str = Field(pattern=r"^(0|[1-9][0-9]{0,76})$", repr=False)


class TinDebitRequest(TinDebitIdentityRequest):
    paymentId: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,128}$")
    amountBaseUnits: str = Field(pattern=r"^[1-9][0-9]{0,19}$")
    nonce: str = Field(pattern=r"^[1-9][0-9]{0,77}$", repr=False)
    amountBlinding: str = Field(pattern=r"^[1-9][0-9]{0,77}$", repr=False)
    deploymentCommitment: str = Field(pattern=r"^[0-9a-f]{64}$")
    validAfterSlot: str = Field(pattern=r"^(0|[1-9][0-9]{0,19})$")
    expiresAtSlot: str = Field(pattern=r"^[1-9][0-9]{0,19}$")
    approval: TinDebitApproval = Field(repr=False)
    senderOpening: TinDebitOpening = Field(repr=False)
