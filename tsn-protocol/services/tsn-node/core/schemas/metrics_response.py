from __future__ import annotations
from pydantic import BaseModel
from core.schemas.intent_to_settlement_metrics import IntentToSettlementMetrics
from core.schemas.uptime_metrics import UptimeMetrics

class MetricsResponse(BaseModel):
    intent_to_settlement: IntentToSettlementMetrics
    uptime: UptimeMetrics
    active_crankers_last_epoch: int
