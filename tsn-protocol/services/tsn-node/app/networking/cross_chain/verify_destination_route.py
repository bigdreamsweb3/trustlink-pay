from __future__ import annotations

from .constants import GET_ROUTE_SELECTOR
from .constants import LATEST_OBSERVATION_SELECTOR
from ._address import _address
from ._bytes32 import _bytes32
from ._eth_call import _eth_call
from ._word import _word
from ._word_address import _word_address
import httpx
from .load_destination_routes import load_destination_routes
from dataclasses import replace

async def verify_destination_route(
    *,
    network: str,
    route_id: str,
    executor: str | None,
    token: str | None,
    requested_amount: int,
    now_seconds: int,
) -> DestinationRoute:
    from .types import DestinationRoute
    routes = load_destination_routes()
    route = routes.get(network.strip().lower())
    if route is None:
        raise ValueError("destination network is not active in the TSN registry")
    if _bytes32(route_id, "routeId") != route.route_id:
        raise ValueError("settlement route ID is not registered for the destination network")
    if route.executor and _address(executor, "destinationExecutor") != route.executor:
        raise ValueError("destination executor is not the registered executor")
    if route.token and _address(token, "destinationToken") != route.token:
        raise ValueError("destination token is not the registered route asset")
    if requested_amount <= 0:
        raise ValueError("destination amount must be positive")

    route_arg = route.route_id[2:]
    async with httpx.AsyncClient(timeout=15) as client:
        route_raw = await _eth_call(client, route.rpc_url, route.registry, GET_ROUTE_SELECTOR + route_arg)
        if _word(route_raw, 0) != 1:
            raise ValueError("destination route is disabled on Creditcoin")
        onchain_executor = _word_address(route_raw, 7)
        onchain_token = _word_address(route_raw, 4)
        if _word(route_raw, 6) != route.destination_chain_id:
            raise ValueError("Creditcoin route chain ID does not match the Node mirror")
        if route.executor and onchain_executor != route.executor:
            raise ValueError("Creditcoin route executor does not match the registry mirror")
        if route.token and onchain_token != route.token:
            raise ValueError("Creditcoin route configuration does not match the signed intent")
        if executor and _address(executor, "destinationExecutor") != onchain_executor:
            raise ValueError("destination executor is not the registered executor")
        if token and _address(token, "destinationToken") != onchain_token:
            raise ValueError("destination token is not the registered route asset")
        observation_raw = await _eth_call(client, route.rpc_url, route.registry, LATEST_OBSERVATION_SELECTOR + route_arg)
        available = _word(observation_raw, 0)
        valid_until = _word(observation_raw, 3)
        if valid_until <= now_seconds:
            raise ValueError("destination liquidity observation is expired")
        if available < requested_amount:
            raise ValueError("verified destination liquidity is insufficient")
    return replace(route, executor=onchain_executor, token=onchain_token)
