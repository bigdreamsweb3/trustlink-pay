"""Shared constants, type aliases and process-local locks for hidden_head_prover."""
from __future__ import annotations
from pathlib import Path

PUBLIC_SIGNALS = (
    "oldGlobalRoot", "newGlobalRoot", "memoCommitment", "actionCommitment", "nullifier", "tipRouteRoot",
    "successorPortfolioRoot", "successorBalanceX", "successorBalanceY", "encryptedBlindingDelta",
    "deltaEphemeralPublicX", "deltaEphemeralPublicY", "fundingRoot",
)
PROTOCOL_ROOT = Path(__file__).resolve().parents[4]
