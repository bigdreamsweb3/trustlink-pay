from __future__ import annotations
from core.schemas.cranker_heartbeat_request import CrankerHeartbeatRequest

class CrankerHeartbeatRecord(CrankerHeartbeatRequest):
    first_seen_at: str
    last_seen_at: str
    online: bool = True
