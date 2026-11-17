"""HiddenHeadWitnessStore.save_candidate implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from settlement.witness.hex_field import hex_field
import json
import os
import secrets

def save_candidate(self, prepared: dict[str, Any]) -> None:
    # Called only after local proof verification. This immutable candidate
    # becomes usable only if a later chain read selects its exact root.
    from amounts.credit.publish_opening import publish_opening
    publish_opening(self.directory,prepared["witness"])
    target = self.directory / f"tcap-{hex_field(prepared['witness']['newGlobalRoot'])}.json"
    encoded = json.dumps(prepared["state"], sort_keys=True, separators=(",", ":")).encode("utf-8")
    temporary = target.with_suffix(f".{secrets.token_hex(8)}.tmp")
    try:
        with temporary.open("xb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        # Publish without overwriting any existing snapshot. Hard-linking
        # the fully flushed file is atomic, including across Node workers.
        try:
            os.link(temporary, target)
        except FileExistsError:
            if target.read_bytes() != encoded:
                raise ValueError("A different candidate snapshot already exists for this root")
    finally:
        temporary.unlink(missing_ok=True)
