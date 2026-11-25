"""Shared constants, type aliases and process-local locks for tcap_epoch_prover."""
from __future__ import annotations
from pathlib import Path

GPRU = "6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR"
INPUTS = ("seed", "digest", "total", "count", "tokenId")
PROTOCOL_ROOT = Path(__file__).resolve().parents[4]
