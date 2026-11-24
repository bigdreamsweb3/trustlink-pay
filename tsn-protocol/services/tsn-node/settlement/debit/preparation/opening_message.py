"""opening_message: private preparation component; validates the canonical debit contract.

Inputs, outputs and failure predicates are defined by the typed implementation.
Dependencies are explicit imports; no service state or RPC is accessed.
"""
from __future__ import annotations
from typing import Any
import re
from .contract import BABYJUB_SUBORDER, OPENING_DOMAIN, OPENING_FIELDS, OPENING_TAG
from .hex_scalar import hex_scalar
from .uint import uint
from ._decimal import _decimal


def opening_message(packet: dict[str, Any]) -> bytes:
    """Canonical domain-separated consent for this opening and this transfer."""
    if (not isinstance(packet, dict) or set(packet) != {*OPENING_TAG, *OPENING_FIELDS}
            or type(packet["version"]) is not int or packet["version"] != 1
            or packet["recordType"] != OPENING_TAG["recordType"]
            or type(packet["leg"]) is not int or packet["leg"] != 0):
        raise ValueError("Transfer opening packet has an unsupported layout")
    for name in ("authorizationCommitment",):
        hex_scalar(packet[name], nonzero=True)
    hex_scalar(packet["previousMemoCommitment"])
    if (not isinstance(packet["routeKeyCommitment"], str)
            or not re.fullmatch(r"[0-9a-f]{64}", packet["routeKeyCommitment"])
            or int(packet["routeKeyCommitment"], 16) == 0):
        raise ValueError("Transfer opening route commitment is malformed")
    uint(packet["tokenId"], 32, positive=True)
    sequence = _decimal(packet["sequence"], 64)
    _decimal(packet["balance"], 128)
    blinding = _decimal(packet["blinding"], 252)
    if blinding >= BABYJUB_SUBORDER:
        raise ValueError("Transfer opening blinding is noncanonical")
    if (sequence == 0) != (packet["previousMemoCommitment"] == "0" * 64):
        raise ValueError("Transfer opening predecessor does not match its sequence")
    return OPENING_DOMAIN + "\n".join(str(packet[name]) for name in OPENING_FIELDS).encode("ascii")
