"""_read_snapshot implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from pathlib import Path
import json
from settlement.witness.unique_snapshot_pairs import unique_snapshot_pairs

def _read_snapshot(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise RuntimeError("GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE: no snapshot for the chain-selected root")
    if path.stat().st_size > 16 * 1024 * 1024:
        raise ValueError("Hidden-head snapshot exceeds the size limit")
    value = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_snapshot_pairs)
    if not isinstance(value, dict) or type(value.get("version")) is not int or value.get("version") != 1:
        raise ValueError("Hidden-head snapshot version is unsupported")
    return value
