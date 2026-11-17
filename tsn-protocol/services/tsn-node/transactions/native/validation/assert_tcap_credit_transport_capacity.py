"""_assert_tcap_credit_transport_capacity: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    SOLANA_V1_TRANSACTION_SIZE_LIMIT: Any
    _tcap_credit_v1_wire_size: Callable[..., Any]


def _assert_tcap_credit_transport_capacity(node: Dependencies, memo_payload: str) -> None:
    wire_bytes = node._tcap_credit_v1_wire_size(memo_payload)
    if wire_bytes > node.SOLANA_V1_TRANSACTION_SIZE_LIMIT:
        raise ValueError(
            f"GPRU_SETTLEMENT_TRANSACTION_TOO_LARGE: canonical Solana v1 transaction is {wire_bytes} bytes; "
            f"maximum is {node.SOLANA_V1_TRANSACTION_SIZE_LIMIT}"
        )
