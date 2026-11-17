"""_ledger_memo_payload_v1 implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
import base64

def _ledger_memo_payload_v1(document: bytes) -> tuple[list[str], str]:
    encoded = base64.urlsafe_b64encode(document).decode("ascii").rstrip("=")
    slots = [encoded[index:index + 32].ljust(32, "=") for index in range(0, len(encoded), 32)]
    return slots, "".join(slot.rstrip("=") for slot in slots)
