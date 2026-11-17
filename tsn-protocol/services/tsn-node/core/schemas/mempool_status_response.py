from __future__ import annotations
from pydantic import BaseModel
from core.schemas.epoch_status import EpochStatus

class MempoolStatusResponse(BaseModel):
    status: str = "ok"
    epoch:  EpochStatus
