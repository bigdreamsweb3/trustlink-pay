from __future__ import annotations



def _bytes32(value: str, field: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized.startswith("0x"):
        normalized = normalized[2:]
    if len(normalized) != 64:
        raise ValueError(f"{field} must be bytes32")
    try:
        int(normalized, 16)
    except ValueError as exc:
        raise ValueError(f"{field} must be bytes32") from exc
    return f"0x{normalized}"
