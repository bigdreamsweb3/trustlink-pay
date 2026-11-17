from __future__ import annotations
from pydantic import BaseModel
from core.schemas.mempool_intent import MempoolIntent

class IntentWorkItem(BaseModel):
    intent: MempoolIntent
