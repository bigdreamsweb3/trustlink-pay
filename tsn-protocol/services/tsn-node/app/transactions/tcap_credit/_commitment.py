from __future__ import annotations

from .constants import _HEX32

def _commitment(label: str, value: str) -> str:
    normalized = value.lower()
    if not _HEX32.fullmatch(normalized):
        raise ValueError(f"{label}_invalid")
    return normalized
