from __future__ import annotations
from typing import Optional
from core.schemas.confirmed_funding_request import ConfirmedFundingRequest

class MempoolIntent(ConfirmedFundingRequest):
    id:                   str
    status:               str           = "pending"
    assignedCrankerPubkey: Optional[str] = None
    fundingTxSig:         Optional[str] = None
    settlementTxSig:      Optional[str] = None
    settlementResolution: Optional[str] = None
    settlementReason:     Optional[str] = None
    postedAt:             str
    updatedAt:            str
