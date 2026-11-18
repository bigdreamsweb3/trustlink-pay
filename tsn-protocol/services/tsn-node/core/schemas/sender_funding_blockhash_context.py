"""Client-reported bank context for one immutable owner-signed funding wire."""
from pydantic import BaseModel, ConfigDict, Field


class SenderFundingBlockhashContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    blockhash: str = Field(..., strict=True, min_length=32, max_length=44)
    lastValidBlockHeight: int = Field(..., strict=True, gt=0, le=9007199254740991)
    contextSlot: int = Field(..., strict=True, ge=0, le=9007199254740991)
