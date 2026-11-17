from __future__ import annotations

from app import config
from datetime import datetime
from .parse_iso import parse_iso

def is_processing_stale(claim: dict, now: datetime) -> bool:
    if claim.get("status") != "processing":
        return False
    updated_at = claim.get("updatedAt") or claim.get("postedAt")
    if not updated_at:
        return False
    return (now - parse_iso(str(updated_at))).total_seconds() >= config.CLAIM_PROCESSING_TIMEOUT_SECS
