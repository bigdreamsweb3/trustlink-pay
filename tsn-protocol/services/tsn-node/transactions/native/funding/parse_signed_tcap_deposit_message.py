"""Parse the shared legacy funding header without changing signed bytes.

Inputs: canonical base64 wire and an explicit shortvec reader. Returns the signed
message, instruction cursor, static keys and canonical hash. Signature validity
and exact permitted deposit instructions are enforced by their existing owners.
"""
from __future__ import annotations
import base64
import binascii
from typing import Callable, Any, Protocol
from app.solana_pubkey import Pubkey


class Dependencies(Protocol):
    _read_solana_shortvec: Callable[..., Any]


def _parse_signed_tcap_deposit_message(node: Dependencies, transaction_base64: str) -> tuple[bytes, int, list[str], str]:
    try:
        wire = base64.b64decode(transaction_base64, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("Owner-signed TCAP deposit transaction is invalid base64") from exc
    if not wire or base64.b64encode(wire).decode("ascii") != transaction_base64:
        raise ValueError("Owner-signed TCAP deposit transaction encoding is not canonical")
    signature_count, offset = node._read_solana_shortvec(wire, 0)
    if signature_count < 1 or offset + signature_count * 64 >= len(wire):
        raise ValueError("Owner-signed TCAP deposit transaction has no wallet signature")
    message = wire[offset + signature_count * 64:]
    if not message or message[0] & 0x80:
        raise ValueError("Versioned TCAP funding transactions are not accepted by the current Node verifier")
    if len(message) < 3:
        raise ValueError("Signed TCAP deposit message header is incomplete")
    account_count, cursor = node._read_solana_shortvec(message, 3)
    if message[0] != signature_count or account_count == 0 or cursor + account_count * 32 + 32 > len(message):
        raise ValueError("Signed TCAP deposit message header is inconsistent")
    account_keys = [str(Pubkey(message[cursor + index * 32:cursor + (index + 1) * 32])) for index in range(account_count)]
    cursor += account_count * 32
    blockhash = str(Pubkey(message[cursor:cursor + 32]))
    return message, cursor + 32, account_keys, blockhash
