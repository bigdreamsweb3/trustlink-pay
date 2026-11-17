"""publish implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from pathlib import Path
from settlement.witness._read_snapshot import _read_snapshot
import json
import os
import secrets

def publish(directory: Path, root: str, snapshot: dict) -> Path:
    target = directory / f"tip-{root}.json"
    encoded = json.dumps(snapshot, separators=(",", ":")).encode("utf-8")
    temporary = target.with_suffix(f".{secrets.token_hex(8)}.tmp")
    try:
        with temporary.open("xb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, target)
        except FileExistsError:
            if _read_snapshot(target) != snapshot:
                raise ValueError("A conflicting TIP snapshot already exists for this root")
    finally:
        temporary.unlink(missing_ok=True)
    return target
