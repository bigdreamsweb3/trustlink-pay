from __future__ import annotations



def canonical_route_message(*, work_id: str, route_commitment: str,
                            mint: str, amount: str, expiry: str, program_id: str) -> str:
    values = (work_id, route_commitment, mint, amount, expiry, program_id)
    if any(not value or "\n" in value or "=" in value for value in values):
        raise ValueError("route authorization fields must be non-empty canonical strings")
    return "\n".join([
        "TSN_ROUTE_AUTHORIZATION", "version=1", f"workId={work_id}",
        f"routeCommitment={route_commitment}",
        f"mint={mint}", f"amount={amount}", f"expiry={expiry}",
        f"programId={program_id}",
    ])
