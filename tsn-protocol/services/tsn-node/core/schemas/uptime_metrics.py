from __future__ import annotations
from pydantic import BaseModel

class UptimeMetrics(BaseModel):
    service_started_at: str
    uptime_seconds: int
    uptime_days: float
    downtime_events: int = 0
