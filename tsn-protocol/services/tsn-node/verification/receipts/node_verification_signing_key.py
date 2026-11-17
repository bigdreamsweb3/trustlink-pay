"""_node_verification_signing_key: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from nacl.signing import SigningKey
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_NODE_VERIFICATION_SIGNING_KEY: Any
    decode_secret_key: Callable[..., Any]


def _node_verification_signing_key(node: Dependencies) -> SigningKey:
    secret = node.decode_secret_key(
        node.TSN_NODE_VERIFICATION_SIGNING_KEY,
        {32, 64},
        "TSN_NODE_VERIFICATION_SIGNING_KEY",
    )
    return SigningKey(secret[:32])
