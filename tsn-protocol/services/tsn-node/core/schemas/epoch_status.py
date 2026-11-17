from __future__ import annotations
from pydantic import BaseModel

class EpochStatus(BaseModel):
    epoch_number:    int
    epoch_started_at: str
    next_close_at:   str
    intent_count:    int
    settlement_count: int
