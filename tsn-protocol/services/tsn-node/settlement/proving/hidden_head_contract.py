"""Shared constants, type aliases and process-local locks for hidden_head_prover."""
from __future__ import annotations
import asyncio
from pathlib import Path

PUBLIC_SIGNALS = (
    "oldGlobalRoot", "newGlobalRoot", "memoCommitment", "actionCommitment", "nullifier", "tipRouteRoot",
    "successorPortfolioRoot", "successorBalanceX", "successorBalanceY", "encryptedBlindingDelta",
    "deltaEphemeralPublicX", "deltaEphemeralPublicY", "fundingRoot",
)
_prover_lock = asyncio.Lock()
PROTOCOL_ROOT = Path(__file__).resolve().parents[4]
