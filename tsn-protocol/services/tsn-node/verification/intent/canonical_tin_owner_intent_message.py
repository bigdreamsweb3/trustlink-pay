"""_canonical_tin_owner_intent_message: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any, Callable, Protocol



def _canonical_tin_owner_intent_message(intent_hash: bytes) -> bytes:
    """Return the printable owner-approval message used by browser wallets.

    The commitment remains the exact 32-byte ``ownerIntentHash``.  This
    display-safe wrapper exists because Phantom and some Wallet Standard
    adapters reject arbitrary binary message payloads even though they
    support detached message signing.
    """
    if len(intent_hash) != 32:
        raise ValueError("TIN owner intent hash must be exactly 32 bytes")
    return (
        "TrustLink TIN creation approval\n"
        "\n"
        "You are approving the encrypted creation request for your TIN.\n"
        "\n"
        "REQUEST DETAILS\n"
        f"Intent reference: {intent_hash.hex()}\n"
        "\n"
        "Protocol: Transfer Identity Protocol (TIP)\n"
        "\n"
        "Version: 1\n"
        "\n"
        "NEXT STEP\n"
        "TSN will verify this approval before submission to Solana.\n"
        "\n"
        "No funds are transferred by this approval."
    ).encode("utf-8")
