"""decode_append_events implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from app.solana_pubkey import Pubkey
from settlement.funding.funding_contract import TCAP_PROGRAM
import base64
from settlement.witness.field_hex import field_hex
from settlement.funding.funded_leaf import funded_leaf
import hashlib
from settlement.witness.hex_field import hex_field
import re

def decode_append_events(receipt: Any, root_address: str, program: str = TCAP_PROGRAM) -> list[dict[str, Any]]:
    if not isinstance(receipt, dict) or not isinstance(receipt.get("meta"), dict) or receipt["meta"].get("err") is not None:
        raise ValueError("TCAP funding history receipt is absent or unsuccessful")
    logs = receipt["meta"].get("logMessages")
    if not isinstance(logs, list):
        raise ValueError("TCAP funding history has no invocation-bound append logs")
    discriminator = hashlib.sha256(b"event:PrivateFundingDepositedV1").digest()[:8]
    stack: list[str] = []
    events = []
    for log in logs:
        if not isinstance(log, str):
            raise ValueError("TCAP funding history log is invalid")
        invoked = re.fullmatch(r"Program (\S+) invoke \[(\d+)\]", log)
        completed = re.fullmatch(r"Program (\S+) (?:success|failed:.*)", log)
        if invoked:
            if int(invoked.group(2)) != len(stack) + 1:
                raise ValueError("TCAP funding invocation depth is inconsistent")
            stack.append(invoked.group(1))
        elif completed:
            if not stack or stack.pop() != completed.group(1):
                raise ValueError("TCAP funding invocation completion is inconsistent")
        elif log.startswith("Program data: ") and stack and stack[-1] == program:
            try:
                data = base64.b64decode(log[14:], validate=True)
            except ValueError as exc:
                raise ValueError("TCAP funding append event encoding is invalid") from exc
            if data[:8] != discriminator:
                continue
            if len(data) != 156 or str(Pubkey(data[8:40])) != root_address:
                raise ValueError("TCAP funding append event root or layout is invalid")
            index = int.from_bytes(data[40:48], "little")
            commitment = data[48:80].hex()
            token = int.from_bytes(data[80:84], "little")
            amount = int.from_bytes(data[84:92], "little")
            leaf = funded_leaf(commitment, token, amount)
            if index >= 1 << 32 or hex_field(leaf) != data[92:124].hex():
                raise ValueError("TCAP funding append event leaf or index is invalid")
            field_hex(data[124:156].hex())
            events.append({"index": index, "leaf": leaf, "root": data[124:156].hex()})
    if stack:
        raise ValueError("TCAP funding invocation logs are incomplete")
    return events
