from __future__ import annotations



def _address(value: str, field: str) -> str:
    normalized = str(value or "").strip().lower()
    if len(normalized) != 42 or not normalized.startswith("0x"):
        raise ValueError(f"{field} must be a 20-byte EVM address")
    try:
        int(normalized[2:], 16)
    except ValueError as exc:
        raise ValueError(f"{field} must be a 20-byte EVM address") from exc
    return normalized
