"""publish_snapshot implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from pathlib import Path
import json
import os
import secrets

def publish_snapshot(directory: Path, root: str, leaves: list[int]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"funding-{root}.json"
    encoded = json.dumps({"version": 1, "leaves": [str(v) for v in leaves]}, sort_keys=True, separators=(",", ":")).encode("ascii")
    temporary = target.with_suffix(f".{secrets.token_hex(8)}.tmp")
    try:
        with temporary.open("xb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, target)
        except FileExistsError:
            if target.read_bytes() != encoded:
                raise ValueError("A different funding snapshot already exists for this root")
    finally:
        temporary.unlink(missing_ok=True)
