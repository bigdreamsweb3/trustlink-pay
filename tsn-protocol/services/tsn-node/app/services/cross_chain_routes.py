"""Creditcoin-backed destination route registry for cross-chain intents.

The Node never treats a chain name or chain ID as sufficient support. A route
must be configured with its exact Creditcoin registry, executor, token, and
route ID, and the registry must report an active route with an unexpired
proof-backed liquidity observation."""

from app.networking.cross_chain import (
    _address,
    _bytes32,
    _word,
    _word_address,
    load_destination_routes,
    _eth_call,
    verify_destination_route,
    configured_destination_networks,
    ready_destination_networks,
    DestinationRoute,
    GET_ROUTE_SELECTOR,
    LATEST_OBSERVATION_SELECTOR,
)

__all__ = ['_address', '_bytes32', '_word', '_word_address', 'load_destination_routes', '_eth_call', 'verify_destination_route', 'configured_destination_networks', 'ready_destination_networks', 'DestinationRoute', 'GET_ROUTE_SELECTOR', 'LATEST_OBSERVATION_SELECTOR']
