"""_tcap_credit_v1_wire_size: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any, Callable, Protocol



def _tcap_credit_v1_wire_size(memo_payload: str) -> int:
    # Canonical @dbrix/solana sendInstructionsV1 transport: 42 fixed message
    # bytes, 16 distinct addresses, two u32 config values, two instruction
    # headers, 14 authorization account indexes plus one Memo signer index,
    # the fixed Borsh authorization payload, and two trailing signatures.
    instruction_bytes = 905
    return 42 + 18 * 32 + 2 * 4 + 2 * 4 + 16 + 1 + instruction_bytes + len(memo_payload.encode("ascii")) + 2 * 64
