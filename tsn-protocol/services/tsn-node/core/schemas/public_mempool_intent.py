from __future__ import annotations
from pydantic import BaseModel
from typing import Optional

class PublicMempoolIntent(BaseModel):
    id: str
    paymentId: str
    intentSeedHash: str
    recipientHash: str
    tokenMintAddress: str
    amount: float
    recipientAmount: Optional[float] = None
    source: Optional[str] = None
    status: str
    assignedCrankerPubkey: Optional[str] = None
    fundingTxSig: Optional[str] = None
    settlementTxSig: Optional[str] = None
    settlementResolution: Optional[str] = None
    settlementReason: Optional[str] = None
    postedAt: str
    updatedAt: str
