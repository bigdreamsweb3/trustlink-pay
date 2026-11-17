from __future__ import annotations

from ._address import _address
from ._bytes32 import _bytes32
import json
import os

def load_destination_routes() -> dict[str, DestinationRoute]:
    from .types import DestinationRoute
    raw = os.environ.get("TSN_DESTINATION_ROUTES_JSON", "").strip()
    if not raw:
        return {}
    try:
        entries = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("TSN_DESTINATION_ROUTES_JSON is invalid JSON") from exc
    if not isinstance(entries, list):
        raise RuntimeError("TSN_DESTINATION_ROUTES_JSON must be a list")

    default_rpc = os.environ.get("TSN_CREDITCOIN_RPC_URL", "").strip()
    routes: dict[str, DestinationRoute] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            raise RuntimeError("each destination route must be an object")
        network = str(entry.get("network") or "").strip().lower()
        if not network or network in routes:
            raise RuntimeError("destination route network is missing or duplicated")
        executor = str(entry.get("executor") or "").strip()
        token = str(entry.get("token") or "").strip()
        route = DestinationRoute(
            network=network,
            route_id=_bytes32(str(entry.get("routeId") or ""), "routeId"),
            registry=_address(str(entry.get("registry") or os.environ.get("TSN_CREDITCOIN_REGISTRY_ADDRESS", "")), "registry"),
            executor=_address(executor, "executor") if executor else None,
            token=_address(token, "token") if token else None,
            destination_chain_id=int(entry.get("destinationChainId") or 0),
            rpc_url=str(entry.get("rpcUrl") or default_rpc).strip(),
        )
        if route.destination_chain_id <= 0 or not route.rpc_url:
            raise RuntimeError(f"destination route {network} is incomplete")
        routes[network] = route
    return routes
