"""select_base implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from pathlib import Path
from settlement.witness.sparse_tree import SparseTree
from settlement.witness._read_snapshot import _read_snapshot
from settlement.witness.hex_field import hex_field
import re
from settlement.tip.validate_snapshot import validate_snapshot
from settlement.witness.snapshot_size import snapshot_size

def select_base(directory: Path, count: int) -> tuple[str, dict]:
    candidates = []
    for path in directory.glob("tip-*.json"):
        if not re.fullmatch(r"tip-[0-9a-f]{64}\.json", path.name):
            continue
        snapshot = _read_snapshot(path)
        if set(snapshot) != {"version", "leaves"} or not isinstance(snapshot["leaves"], list):
            raise ValueError("TIP cached snapshot schema is invalid")
        if len(snapshot["leaves"]) < count:
            candidates.append((len(snapshot["leaves"]), path, snapshot))
    if candidates:
        _, path, snapshot = max(candidates, key=snapshot_size)
        root = path.stem[4:]
        validate_snapshot(snapshot, root)
        return root, snapshot
    # Bootstrap the same append-only tree from confirmed creation index zero.
    return hex_field(SparseTree(32, {}).root), {"version": 1, "leaves": []}
