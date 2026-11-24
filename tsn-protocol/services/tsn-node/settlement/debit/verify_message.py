"""Require exact leased debit instructions and least account privileges."""
from fastapi import HTTPException
from .wire import debit_instructions


from typing import Any, Callable, Protocol


class Dependencies(Protocol):
    TSN_PROGRAM_ID: str
    TCAP_PROGRAM_ID: str
    GPRU_PROGRAM_ID: str
    TINS_PROGRAM_ID: str
    _parse_solana_v1_message: Callable[..., Any]


def verify_debit_message(node: Dependencies, message: bytes, operator: str, authority: str, transition: dict) -> bytes:
    required, readonly_signed, readonly_unsigned, keys, blockhash, instructions = node._parse_solana_v1_message(message)
    expected = debit_instructions(node, transition)
    if (len(message) + 128 > 4096 or required != 2 or readonly_signed != 1 or keys[:2] != [operator, authority]
        or transition["authority"] != authority or not any(blockhash) or instructions != expected
        or int.from_bytes(message[4:8], "little") != 12):
        raise HTTPException(403, "TIN_DEBIT_SIGNING_MESSAGE_MISMATCH")
    allowed = {operator, authority, *(key for _, accounts, _ in expected for key in accounts), *(program for program, _, _ in expected)}
    if len(keys) != len(allowed) or set(keys) != allowed:
        raise HTTPException(403, "TIN_DEBIT_SIGNING_ACCOUNTS_MISMATCH")
    writable = {operator, transition["commitmentRoot"]}
    for index, key in enumerate(keys):
        actual = index < required - readonly_signed if index < required else index < len(keys) - readonly_unsigned
        if actual != (key in writable):
            raise HTTPException(403, "TIN_DEBIT_SIGNING_PERMISSIONS_MISMATCH")
    cursor = 42 + len(keys) * 32
    if int.from_bytes(message[cursor:cursor + 4], "little") != 1400000 or int.from_bytes(message[cursor + 4:cursor + 8], "little") != 67108864:
        raise HTTPException(403, "TIN_DEBIT_SIGNING_CONFIG_MISMATCH")
    return blockhash
