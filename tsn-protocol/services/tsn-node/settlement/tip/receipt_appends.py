"""receipt_appends implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from app.solana_pubkey import Pubkey
from settlement.tip.tip_contract import TIP
from app.solana_pubkey import _decode_base58
import re

def receipt_appends(receipt: dict, signature: str, slot: int, tip_program: Pubkey = TIP) -> list[tuple[int, str]]:
    route_root = Pubkey.find_program_address([b"tip:route-merkle-root:v1"], tip_program)[0]
    meta = receipt.get("meta")
    if receipt.get("slot") != slot or not isinstance(meta, dict) or meta.get("err") is not None:
        raise ValueError("TIP creation receipt is not the selected successful confirmation")
    logs = meta.get("logMessages")
    if not isinstance(logs, list) or len(logs) > 1000:
        raise ValueError("TIP history receipt logs are unavailable or exceed the limit")
    stack, indices = [], []
    for line in logs:
        if not isinstance(line, str):
            raise ValueError("TIP history log is invalid")
        invoke = re.fullmatch(r"Program ([1-9A-HJ-NP-Za-km-z]+) invoke \[([0-9]+)\]", line)
        terminal = re.fullmatch(r"Program ([1-9A-HJ-NP-Za-km-z]+) (?:success|failed: .+)", line)
        appended = re.fullmatch(r"Program log: TIP V1 route appended to shared membership root at index=([0-9]+)", line)
        if invoke:
            if int(invoke[2]) != len(stack) + 1:
                raise ValueError("TIP receipt invocation depth is invalid")
            stack.append(invoke[1])
        elif terminal:
            if not stack or stack.pop() != terminal[1]:
                raise ValueError("TIP receipt invocation order is invalid")
        elif appended and stack and stack[-1] == str(tip_program):
            if stack != [str(tip_program)]:
                raise ValueError("Nested TIP creation is unsupported by the snapshot synchronizer")
            indices.append(int(appended[1]))
    if stack:
        raise ValueError("TIP history receipt logs are truncated")
    if not indices:
        return []
    transaction = receipt.get("transaction") or {}
    if receipt.get("version", "legacy") not in ("legacy", 0) or (transaction.get("signatures") or [None])[0] != signature:
        raise ValueError("TIP creation transaction version or signature is invalid")
    creations = []
    for instruction in (transaction.get("message") or {}).get("instructions", []):
        if instruction.get("programId") != str(tip_program):
            continue
        data = _decode_base58(instruction.get("data") or "")
        if not data or data[0] not in (17, 21):
            continue
        accounts = instruction.get("accounts")
        if (not isinstance(accounts, list) or len(accounts) != (7 if data[0] == 17 else 8)
                or accounts[2] != str(route_root) or (data[0] == 21 and len(data) != 33)):
            raise ValueError("TIP creation instruction account layout is invalid")
        Pubkey.from_string(accounts[3])
        creations.append(accounts[3])
    if len(creations) != len(indices):
        raise ValueError("TIP creation instructions do not match confirmed append logs")
    return list(zip(indices, creations))
