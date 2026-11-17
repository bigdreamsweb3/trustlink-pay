from __future__ import annotations



def _evm_address(value: str) -> str:
    if not isinstance(value, str) or len(value) != 42 or not value.startswith("0x"):
        raise ValueError("recipient must be a 20-byte EVM address")
    try:
        int(value[2:], 16)
    except ValueError as exc:
        raise ValueError("recipient must be a 20-byte EVM address") from exc
    return value
