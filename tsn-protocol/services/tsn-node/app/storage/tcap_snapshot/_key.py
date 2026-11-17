from __future__ import annotations

from .constants import _COMMITMENT_RE

def _key(commitment: str) -> str:
    normalized = commitment.lower()
    if not _COMMITMENT_RE.fullmatch(normalized):
        raise ValueError("commitment_invalid")
    return normalized
