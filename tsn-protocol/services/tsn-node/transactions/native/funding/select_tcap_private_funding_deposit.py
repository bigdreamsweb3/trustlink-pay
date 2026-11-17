"""_select_tcap_private_funding_deposit: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
import hashlib
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TCAP_PROGRAM_ID: Any


def _select_tcap_private_funding_deposit(node: Dependencies,
    instructions: list[tuple[str, list[str], bytes]],
) -> tuple[str, list[str], bytes]:
    """Allow wallet compute settings without permitting another funding action."""
    deposit_disc = hashlib.sha256(b"global:deposit_private_funding_v1").digest()[:8]
    deposits = [instruction for instruction in instructions
                if instruction[0] == node.TCAP_PROGRAM_ID and instruction[2][:8] == deposit_disc]
    if len(deposits) != 1:
        raise ValueError("Wallet funding transaction must contain exactly one TCAP reserve deposit")
    compute_program = "ComputeBudget111111111111111111111111111111"
    compute_lengths = {1: 5, 2: 5, 3: 9, 4: 5}
    seen_compute_tags: set[int] = set()
    for instruction in instructions:
        if instruction is deposits[0]:
            continue
        program, accounts, data = instruction
        tag = data[0] if data else None
        if (program != compute_program or accounts or tag not in compute_lengths
                or len(data) != compute_lengths[tag] or tag in seen_compute_tags):
            raise ValueError("Wallet funding transaction contains an unsupported additional instruction")
        value = int.from_bytes(data[1:], "little")
        if tag == 1 and (value < 32 * 1024 or value > 256 * 1024 or value % 1024):
            raise ValueError("Wallet funding transaction has an invalid compute heap frame")
        if tag in (2, 4) and value == 0:
            raise ValueError("Wallet funding transaction has an invalid compute limit")
        seen_compute_tags.add(tag)
    return deposits[0]
