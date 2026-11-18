"""_parse_signed_tcap_deposit_instructions: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from .parse_signed_tcap_deposit_message import _parse_signed_tcap_deposit_message
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    _read_solana_shortvec: Callable[..., Any]


def _parse_signed_tcap_deposit_instructions(node: Dependencies, transaction_base64: str) -> list[tuple[str, list[str], bytes]]:
    message, cursor, account_keys, _ = _parse_signed_tcap_deposit_message(node, transaction_base64)
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
