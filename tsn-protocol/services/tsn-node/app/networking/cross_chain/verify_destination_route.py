"""Reject external settlement until an independently verified route is implemented."""
from __future__ import annotations

async def verify_destination_route(
    *,
    network: str,
    route_id: str,
    executor: str | None,
    token: str | None,
    requested_amount: int,
    now_seconds: int,
) -> None:
    """Fail before registry RPC, debit authorization or destination submission."""
    raise ValueError("cross-network settlement is not enabled")
