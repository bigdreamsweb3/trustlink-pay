from __future__ import annotations

from typing import Any
from .load_destination_routes import load_destination_routes

def configured_destination_networks() -> list[dict[str, Any]]:
    return [
        {
            "name": route.network,
            "routeId": route.route_id,
            "chainId": route.destination_chain_id,
            "executor": route.executor,
            "supportedAssets": [route.token],
            "status": "configured; live liquidity checked per intent",
        }
        for route in load_destination_routes().values()
    ]
