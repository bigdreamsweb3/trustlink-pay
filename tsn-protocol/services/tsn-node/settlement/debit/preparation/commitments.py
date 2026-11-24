"""commitments: private preparation component; validates the canonical debit contract.

Inputs, outputs and failure predicates are defined by the typed implementation.
Dependencies are explicit imports; no service state or RPC is accessed.
"""
from __future__ import annotations
from security.cryptography.poseidon_v1 import poseidon_v1
from typing import Any
from .contract import ACTION_KIND, AUTH_DOMAIN, CONTEXT_DOMAIN, NULLIFIER_DOMAIN, VALUE_DOMAIN
from .route_fields import route_fields
from .scalar import scalar
from .uint import uint


def commitments(*, sender_route: dict[str, Any], recipient_route: dict[str, Any],
                token_id: int, amount: int, nonce: int, amount_blinding: int,
                deployment: int, valid_after_slot: int, expires_at_slot: int) -> dict[str, int]:
    sender, recipient = route_fields(sender_route), route_fields(recipient_route)
    uint(token_id, 32, positive=True)
    uint(amount, 64, positive=True)
    scalar(nonce, nonzero=True)
    scalar(amount_blinding, nonzero=True)
    scalar(deployment, nonzero=True)
    uint(valid_after_slot, 64)
    uint(expires_at_slot, 64)
    if expires_at_slot < valid_after_slot:
        raise ValueError("Transfer authorization interval is reversed")
    if sender[1] % (1 << 128) == recipient[1] % (1 << 128):
        raise ValueError("Transfer requires two distinct hidden-head indices")
    nullifier = poseidon_v1([NULLIFIER_DOMAIN, sender[1], nonce])
    value = poseidon_v1([VALUE_DOMAIN, token_id, amount, amount_blinding, nullifier])
    context = poseidon_v1([CONTEXT_DOMAIN, deployment, token_id, valid_after_slot, expires_at_slot])
    approval = poseidon_v1([AUTH_DOMAIN, sender[1], recipient[1], value, poseidon_v1([context, nonce])])
    action = poseidon_v1([ACTION_KIND, token_id, value, approval, nullifier])
    if any(number == 0 for number in (nullifier, value, approval, action)):
        raise ValueError("Transfer commitment is zero")
    return {"nullifier": nullifier, "amountCommitment": value,
            "authorizationCommitment": approval, "actionCommitment": action}
