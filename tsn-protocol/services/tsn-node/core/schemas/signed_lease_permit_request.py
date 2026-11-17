from __future__ import annotations
from pydantic import BaseModel

class SignedLeasePermitRequest(BaseModel):
    operatorPubkey: str
    requestedAtTs: int
    requestSignatureBase64: str
