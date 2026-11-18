"""Owner authorization for restricted same-intent funding preparation."""
from pydantic import BaseModel, ConfigDict, Field


class FundingReadinessRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workId: str = Field(..., min_length=1, max_length=128)
    senderPubkey: str = Field(..., min_length=32, max_length=44)
    authorizationSignature: str = Field(..., repr=False, min_length=1, max_length=128)
