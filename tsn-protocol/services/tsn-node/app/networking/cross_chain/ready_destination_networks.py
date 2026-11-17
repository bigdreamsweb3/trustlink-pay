from __future__ import annotations

from typing import Any
import httpx
from .load_destination_routes import load_destination_routes
from .verify_destination_route import verify_destination_route

async def ready_destination_networks(now_seconds: int) -> list[dict[str, Any]]:
    """Return routes that pass the same live checks used by intent admission.

    The amount-one probe is only a readiness probe. The signed intent is still
    checked with its exact amount immediately before authorization.
    """
    ready: list[dict[str, Any]] = []
    for route in load_destination_routes().values():
        try:
            verified_route = await verify_destination_route(
                network=route.network,
                route_id=route.route_id,
                executor=route.executor,
                token=route.token,
                requested_amount=1,
                now_seconds=now_seconds,
            )
        except (RuntimeError, ValueError, httpx.HTTPError):
            continue
        ready.append(
            {
                "name": route.network,
                "routeId": route.route_id,
                "chainId": route.destination_chain_id,
                "executor": verified_route.executor,
                "supportedAssets": [verified_route.token],
                "status": "ready; live liquidity verified",
            }
        )
    return ready
