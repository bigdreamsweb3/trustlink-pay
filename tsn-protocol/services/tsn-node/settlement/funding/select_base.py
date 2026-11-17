"""select_base implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from pathlib import Path
from settlement.witness._read_snapshot import _read_snapshot
import re
from settlement.funding.validate_snapshot import validate_snapshot
from settlement.witness.snapshot_size import snapshot_size

def select_base(directory: Path, count: int) -> list[int]:
    """A cached prefix is usable only if the extended tree matches chain state."""
    candidates = []
    for path in directory.glob("funding-*.json"):
        if not re.fullmatch(r"funding-[0-9a-f]{64}\.json", path.name):
            continue
        snapshot = _read_snapshot(path)
        if not isinstance(snapshot, dict) or not isinstance(snapshot.get("leaves"), list):
            raise ValueError("TCAP cached funding snapshot schema is invalid")
        if len(snapshot["leaves"]) < count:
            candidates.append((len(snapshot["leaves"]), path, snapshot))
    if not candidates:
        return []
    size, path, snapshot = max(candidates, key=snapshot_size)
    return validate_snapshot(snapshot, path.stem[8:], size)
