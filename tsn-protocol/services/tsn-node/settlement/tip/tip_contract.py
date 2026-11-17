"""Shared constants, type aliases and process-local locks for tip_snapshot_sync."""
from __future__ import annotations
from typing import Any
from typing import Awaitable
from typing import Callable
from app.solana_pubkey import Pubkey

TIP = Pubkey.from_string("TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT")
ROUTE_ROOT, ROOT_BUMP = Pubkey.find_program_address([b"tip:route-merkle-root:v1"], TIP)
MAX_ROUTES = 10_000
Rpc = Callable[[str, list[Any]], Awaitable[dict[str, Any]]]
