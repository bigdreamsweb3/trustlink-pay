"""_parse_solana_v1_message: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from typing import Any, Callable, Protocol



def _parse_solana_v1_message(message: bytes) -> tuple[int, int, int, list[str], bytes, list[tuple[str, list[str], bytes]]]:
    # Solana v1: 0x81 marker, three-byte header, u32 config mask, blockhash,
    # u8 instruction/address counts, inline addresses, config values, a run of
    # fixed-width instruction headers, then a run of instruction payloads.
    if len(message) < 42 or message[0] != 0x81:
        raise ValueError("Mother signing accepts only Solana v1 transaction messages")
    required_signatures, readonly_signed, readonly_unsigned = message[1:4]
    config_mask = int.from_bytes(message[4:8], "little")
    if config_mask & ~0x1F or config_mask & 0x03 not in (0, 0x03):
        raise ValueError("Mother signing transaction has an invalid v1 config mask")
    if config_mask & 0x0C != 0x0C:
        raise ValueError("Mother signing v1 transaction must set compute and loaded-account limits")
    recent_blockhash = message[8:40]
    instruction_count = message[40]
    account_count = message[41]
    if account_count == 0 or account_count > 96 or instruction_count == 0 or instruction_count > 64:
        raise ValueError("Mother signing v1 transaction has invalid instruction or account counts")
    cursor = 42
    address_bytes = account_count * 32
    if cursor + address_bytes > len(message):
        raise ValueError("Mother signing v1 transaction account list is truncated")
    account_keys = [
        str(Pubkey(message[cursor + index * 32:cursor + (index + 1) * 32]))
        for index in range(account_count)
    ]
    cursor += address_bytes
    config_bytes = (8 if config_mask & 0x03 == 0x03 else 0)
    config_bytes += 4 * sum(bool(config_mask & (1 << bit)) for bit in (2, 3, 4))
    if cursor + config_bytes + instruction_count * 4 > len(message):
        raise ValueError("Mother signing v1 transaction config or instruction headers are truncated")
    cursor += config_bytes
    headers: list[tuple[int, int, int]] = []
    for _ in range(instruction_count):
        program_index = message[cursor]
        account_index_count = message[cursor + 1]
        data_length = int.from_bytes(message[cursor + 2:cursor + 4], "little")
        cursor += 4
        headers.append((program_index, account_index_count, data_length))
    instructions: list[tuple[str, list[str], bytes]] = []
    for program_index, account_index_count, data_length in headers:
        payload_length = account_index_count + data_length
        if cursor + payload_length > len(message):
            raise ValueError("Mother signing v1 transaction instruction payload is truncated")
        account_indexes = list(message[cursor:cursor + account_index_count])
        cursor += account_index_count
        data = message[cursor:cursor + data_length]
        cursor += data_length
        if program_index >= len(account_keys) or any(index >= len(account_keys) for index in account_indexes):
            raise ValueError("Mother signing v1 transaction references an invalid account index")
        instructions.append((account_keys[program_index], [account_keys[index] for index in account_indexes], data))
    if cursor != len(message) or len(set(account_keys)) != len(account_keys):
        raise ValueError("Mother signing v1 transaction has trailing data or duplicate account keys")
    return required_signatures, readonly_signed, readonly_unsigned, account_keys, recent_blockhash, instructions
