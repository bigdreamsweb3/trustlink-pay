"""Shared constants, type aliases and process-local locks for funding_snapshot_sync."""
from __future__ import annotations
from typing import Any
from typing import Awaitable
from typing import Callable

TCAP_PROGRAM = "tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF"
ROOT_SEED = b"tcap:funding-root:v1"
MAX_LEAVES = 10_000
MAX_SIGNATURES = 10_000
FUNDING_ROOT_SPACE = 6209
FUNDING_HISTORY_CAPACITY = 128
FUNDING_ROOT_CHANGED = "TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT"
FUNDING_ROOT_INVALID = "TCAP_FUNDING_ROOT_INVALID"
Rpc = Callable[[str, list[Any]], Awaitable[dict[str, Any]]]
