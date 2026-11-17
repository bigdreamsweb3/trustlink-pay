"""commit_epoch_to_github_count_statuses: isolated helper; captured dependencies are explicit arguments."""
from __future__ import annotations
from typing import Any
import base64
import httpx
import json
import os
from typing import Any, Protocol
class Dependencies(Protocol):
    GITHUB_API: Any
    GITHUB_REPO: Any

def commit_epoch_to_github_count_statuses(items: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        status = str(item.get('status') or 'recorded')
        counts[status] = counts.get(status, 0) + 1
    return counts
