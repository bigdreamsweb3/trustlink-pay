"""Atomically publish a locally verified debit successor for later chain selection."""
import json
import os
import secrets
from pathlib import Path


def publish_debit_candidate(directory: Path, root: str, state: dict) -> None:
    target = directory / f"tcap-{root}.json"
    encoded = json.dumps(state, sort_keys=True, separators=(",", ":")).encode("utf-8")
    temporary = directory / f".tin-debit-{secrets.token_hex(12)}.tmp"
    try:
        with temporary.open("xb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, target)
        except FileExistsError:
            if target.read_bytes() != encoded:
                raise ValueError("TIN_DEBIT_CANDIDATE_CONFLICT")
    finally:
        temporary.unlink(missing_ok=True)
