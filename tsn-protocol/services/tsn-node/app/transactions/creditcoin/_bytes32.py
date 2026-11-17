from __future__ import annotations



def _bytes32(value: str, field: str) -> str:
    if not isinstance(value, str) or len(value) != 66 or not value.startswith("0x"):
        raise ValueError(f"{field} must be a 32-byte hex value")
    try:
        int(value[2:], 16)
    except ValueError as exc:
        raise ValueError(f"{field} must be a 32-byte hex value") from exc
    return value.lower()
