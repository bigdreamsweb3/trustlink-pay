from __future__ import annotations
from pydantic import BaseModel
from pydantic import Field
from typing import Optional

class UpdateStatusRequest(BaseModel):
    status:               str           = Field(...)
    assignedCrankerPubkey: Optional[str] = Field(None)
    fundingTxSig:         Optional[str] = Field(None)
    settlementTxSig:      Optional[str] = Field(None)
    settlementResolution: Optional[str] = Field(None)
    settlementReason:     Optional[str] = Field(None)
