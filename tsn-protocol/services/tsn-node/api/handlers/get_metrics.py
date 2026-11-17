"""get_metrics: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from typing import Optional
from core.schemas.intent_to_settlement_metrics import IntentToSettlementMetrics
from core.schemas.metrics_response import MetricsResponse
from core.schemas.uptime_metrics import UptimeMetrics
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    SERVICE_STARTED_AT: Any
    hget_all_json: Callable[..., Any]
    k_intents: Callable[..., Any]


async def get_metrics(node: Dependencies) -> MetricsResponse:
    intents = await node.hget_all_json(node.k_intents())
    samples: list[float] = []
    latest: Optional[str] = None
    uptime_seconds = int((datetime.now(timezone.utc) - node.SERVICE_STARTED_AT).total_seconds())
    crankers = {intent.get("assignedCrankerPubkey") for intent in intents if intent.get("assignedCrankerPubkey")}
    return MetricsResponse(
        intent_to_settlement=IntentToSettlementMetrics(
            sample_count=len(samples),
            average_ms=sum(samples) / len(samples) if samples else 0,
            min_ms=min(samples) if samples else 0,
            max_ms=max(samples) if samples else 0,
            last_ms=samples[-1] if samples else 0,
            updated_at=latest,
        ),
        uptime=UptimeMetrics(
            service_started_at=node.SERVICE_STARTED_AT.isoformat(),
            uptime_seconds=uptime_seconds,
            uptime_days=uptime_seconds / 86400,
        ),
        active_crankers_last_epoch=len(crankers),
    )
