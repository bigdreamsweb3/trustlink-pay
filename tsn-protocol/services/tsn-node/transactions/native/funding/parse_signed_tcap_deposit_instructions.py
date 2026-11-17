"""_parse_signed_tcap_deposit_instructions: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
import base64
import binascii
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    _read_solana_shortvec: Callable[..., Any]


def _parse_signed_tcap_deposit_instructions(node: Dependencies, transaction_base64: str) -> list[tuple[str, list[str], bytes]]:
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
    cursor = 0
    if not message or message[0] & 0x80:
        raise ValueError("Versioned TCAP funding transactions are not accepted by the current Node verifier")
    if len(message) < 3:
        raise ValueError("Signed TCAP deposit message header is incomplete")
    required_signatures = message[0]
    cursor = 3
    account_count, cursor = node._read_solana_shortvec(message, cursor)
    if required_signatures != signature_count or account_count == 0 or cursor + account_count * 32 + 32 > len(message):
        raise ValueError("Signed TCAP deposit message header is inconsistent")
    account_keys = [str(Pubkey(message[cursor + index * 32:cursor + (index + 1) * 32])) for index in range(account_count)]
    cursor += account_count * 32 + 32  # static keys and recent blockhash
    instruction_count, cursor = node._read_solana_shortvec(message, cursor)
    instructions: list[tuple[str, list[str], bytes]] = []
    for _ in range(instruction_count):
        if cursor >= len(message):
            raise ValueError("Signed TCAP deposit instruction list is truncated")
        program_index = message[cursor]
        cursor += 1
        account_index_count, cursor = node._read_solana_shortvec(message, cursor)
        if cursor + account_index_count > len(message):
            raise ValueError("Signed TCAP deposit account list is truncated")
        indexes = list(message[cursor:cursor + account_index_count])
        cursor += account_index_count
        data_length, cursor = node._read_solana_shortvec(message, cursor)
        if cursor + data_length > len(message) or program_index >= len(account_keys) or any(index >= len(account_keys) for index in indexes):
            raise ValueError("Signed TCAP deposit instruction data is truncated or references an invalid key")
        data = message[cursor:cursor + data_length]
        cursor += data_length
        instructions.append((account_keys[program_index], [account_keys[index] for index in indexes], data))
    if cursor != len(message):
        raise ValueError("Signed TCAP deposit message contains unsupported trailing data")
    return instructions
