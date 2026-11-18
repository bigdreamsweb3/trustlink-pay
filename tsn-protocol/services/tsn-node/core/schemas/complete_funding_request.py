"""Attach only the approved wire and its exact bank tuple to an existing intent."""
from pydantic import Field
from .funding_readiness_request import FundingReadinessRequest
from .sender_funding_blockhash_context import SenderFundingBlockhashContext


class CompleteFundingRequest(FundingReadinessRequest):
    expectedStateVersion: int = Field(..., strict=True, gt=0)
    authorizationPayloadCommitment: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    senderFundingDepositTxB64: str = Field(..., repr=False, min_length=1, max_length=5464)
    senderFundingBlockhashContext: SenderFundingBlockhashContext
