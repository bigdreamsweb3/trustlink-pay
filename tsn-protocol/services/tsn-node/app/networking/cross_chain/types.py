from __future__ import annotations

from dataclasses import dataclass

@dataclass(frozen=True)
class DestinationRoute:
    network: str
    route_id: str
    registry: str
    executor: str | None
    token: str | None
    destination_chain_id: int
    rpc_url: str
