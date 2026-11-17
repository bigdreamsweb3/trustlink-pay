"""_decode_funding_root implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from settlement.funding.funding_contract import FUNDING_HISTORY_CAPACITY
from settlement.funding.funding_contract import FUNDING_ROOT_SPACE
from settlement.funding.funding_contract import TCAP_PROGRAM
import base64
from settlement.witness.field_hex import field_hex
from settlement.funding.funding_root_address import funding_root_address
import hashlib

def _decode_funding_root(account: Any, program: str = TCAP_PROGRAM) -> dict[str, Any]:
    _, bump = funding_root_address(program)
    if not isinstance(account, dict) or account.get("owner") != program:
        raise ValueError("TCAP funding root is missing or has the wrong owner")
    try:
        data = base64.b64decode(account["data"][0], validate=True)
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise ValueError("TCAP funding root encoding is invalid") from exc
    if (len(data) != FUNDING_ROOT_SPACE or data[:8] != hashlib.sha256(b"account:TcapFundingMerkleRootV1").digest()[:8]
            or int.from_bytes(data[8:10], "little") != 2 or int.from_bytes(data[10:12], "little") != 1
            or data[12] != bump or int.from_bytes(data[53:57], "little") != 32):
        raise ValueError("TCAP funding root layout, version or bump is invalid")
    root = data[13:45].hex()
    if field_hex(root) == 0:
        raise ValueError("TCAP funding root must be nonzero")
    count = int.from_bytes(data[45:53], "little")
    if count > 1 << 32:
        raise ValueError("TCAP funding root count exceeds its depth")
    for offset in range(57, 1081, 32):
        field_hex(data[offset:offset + 32].hex())
    capacity = int.from_bytes(data[1081:1085], "little")
    cursor = int.from_bytes(data[6205:6207], "little")
    history_count = int.from_bytes(data[6207:6209], "little")
    if (capacity != FUNDING_HISTORY_CAPACITY or not 0 <= cursor < capacity
            or not 0 <= history_count <= capacity
            or history_count < capacity and cursor != history_count
            or (count == 0) != (history_count == 0)):
        raise ValueError("TCAP funding root history layout or cursor is invalid")
    records = []
    for index in range(capacity):
        offset = 1085 + index * 40
        entry_root = data[offset:offset + 32].hex()
        entry_count = int.from_bytes(data[offset + 32:offset + 40], "little")
        active = history_count == capacity or index < history_count
        if active:
            if field_hex(entry_root) == 0 or not 0 < entry_count <= 1 << 32:
                raise ValueError("TCAP funding root history entry is invalid")
        elif entry_root != "00" * 32 or entry_count != 0:
            raise ValueError("TCAP funding root inactive history entry must be zero")
        records.append({"root": entry_root, "count": entry_count})
    history = ([records[(cursor + index) % capacity] for index in range(capacity)]
               if history_count == capacity else records[:history_count])
    if (any(left["count"] >= right["count"] for left, right in zip(history, history[1:]))
            or history and (history[-1]["root"], history[-1]["count"]) != (root, count)):
        raise ValueError("TCAP funding root history order or latest entry is invalid")
    return {"root": root, "count": count, "history": history}
