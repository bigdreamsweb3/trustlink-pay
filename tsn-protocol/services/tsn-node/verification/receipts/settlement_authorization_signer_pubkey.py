"""settlement_authorization_signer_pubkey: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    encode_base58: Callable[..., Any]
    get_settlement_authorization_signing_key: Callable[..., Any]


def settlement_authorization_signer_pubkey(node: Dependencies) -> str:
    return node.encode_base58(bytes(node.get_settlement_authorization_signing_key().verify_key))
