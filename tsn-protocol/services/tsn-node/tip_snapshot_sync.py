"""Reconstruct TIP membership witnesses from confirmed, indexed creation history.

Only commitments are stored. Chain root/count equality selects every snapshot;
this module never authorizes work, decrypts owner data or submits transactions.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import re
import secrets
from pathlib import Path
from typing import Any, Awaitable, Callable

from app.solana_pubkey import Pubkey, _decode_base58
from gpru_crypto import BABYJUB_FIELD, poseidon_v1
from hidden_head_witness import SparseTree, _point, _read_snapshot, field, field_hex, hex_field

TIP = Pubkey.from_string("TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT")
ROUTE_ROOT, ROOT_BUMP = Pubkey.find_program_address([b"tip:route-merkle-root:v1"], TIP)
MAX_ROUTES = 10_000
Rpc = Callable[[str, list[Any]], Awaitable[dict[str, Any]]]


def decode_registry(address: str, data: bytes, tip_program: Pubkey = TIP) -> int:
    offset = 0

    def take(length: int) -> bytes:
        nonlocal offset
        if length < 0 or offset + length > len(data):
            raise ValueError("TIP registry is truncated")
        result = data[offset:offset + length]
        offset += length
        return result

    version, bump, status = take(3)
    take(5)
    lookup = take(32)
    take(32)  # Owner commitment is not part of the route leaf.
    for _ in range(2):
        length = int.from_bytes(take(4), "little")
        # Skip encrypted envelopes without decoding or returning them.
        if offset + length > len(data):
            raise ValueError("TIP registry envelope is truncated")
        offset += length
    take(8 + 32)
    route_version = int.from_bytes(take(8), "little")
    take(32)
    tip_version, key_version = take(2)
    public_key, key = take(32), take(32)
    scan_version = take(1)[0]
    x, y, policy = take(32), take(32), take(32)
    expected_address, expected_bump = Pubkey.find_program_address([b"tin-v1", lookup], tip_program)
    if (version != 1 or status != 1 or route_version < 1 or tip_version != 1
            or key_version != 1 or scan_version != 1 or bump != expected_bump
            or str(expected_address) != address or any(data[offset:])
            or any(value == bytes(32) for value in (lookup, public_key, key, x, y, policy))):
        raise ValueError("TIP registry is not an active canonical V1 route")
    if hashlib.sha256(b"TSN_GPRU_ELGAMAL_KEY_COMMITMENT_V1\0" + bytes([key_version]) + public_key).digest() != key:
        raise ValueError("TIP registry ElGamal commitment is invalid")
    _point({"x": str(int.from_bytes(x, "big")), "y": str(int.from_bytes(y, "big"))})
    return poseidon_v1([int.from_bytes(value, "big") % BABYJUB_FIELD for value in (lookup, key, x, y, policy)])


def decode_root(data: bytes, tip_program: Pubkey = TIP) -> tuple[str, int]:
    root_bump = Pubkey.find_program_address([b"tip:route-merkle-root:v1"], tip_program)[1]
    if len(data) < 1066 or any(data[1066:]) or data[0] != 1 or data[1] != root_bump:
        raise ValueError("TIP route root layout is invalid")
    root, count = data[2:34].hex(), int.from_bytes(data[34:42], "little")
    if field_hex(root) == 0 or not 0 < count <= 1 << 32:
        raise ValueError("TIP route root or count is invalid")
    return root, count


def extend_snapshot(snapshot: dict, base_root: str, leaves: list[int], chain_root: str, count: int) -> dict:
    if set(snapshot) != {"version", "leaves"} or snapshot["version"] != 1 or not isinstance(snapshot["leaves"], list):
        raise ValueError("TIP snapshot schema is invalid")
    previous = [field(value) for value in snapshot["leaves"]]
    if any(value == 0 for value in previous + leaves):
        raise ValueError("TIP ordered leaves must be nonzero")
    if SparseTree(32, dict(enumerate(previous))).root != field_hex(base_root):
        raise ValueError("Base TIP snapshot does not match its root")
    combined = previous + leaves
    if len(combined) != count or SparseTree(32, dict(enumerate(combined))).root != field_hex(chain_root):
        raise ValueError("Extended TIP snapshot does not match the confirmed chain root and count")
    return {"version": 1, "leaves": [str(value) for value in combined]}


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


def validate_snapshot(snapshot: dict, root: str) -> list[int]:
    if set(snapshot) != {"version", "leaves"} or snapshot["version"] != 1 or not isinstance(snapshot["leaves"], list):
        raise ValueError("TIP snapshot schema is invalid")
    leaves = [field(value) for value in snapshot["leaves"]]
    if len(leaves) > MAX_ROUTES or any(leaf == 0 for leaf in leaves):
        raise ValueError("TIP snapshot exceeds the route limit or contains zero leaves")
    if hex_field(SparseTree(32, dict(enumerate(leaves))).root) != root:
        raise ValueError("TIP snapshot does not match its selected root")
    return leaves


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
        _, path, snapshot = max(candidates, key=lambda item: item[0])
        root = path.stem[4:]
        validate_snapshot(snapshot, root)
        return root, snapshot
    # Bootstrap the same append-only tree from confirmed creation index zero.
    return hex_field(SparseTree(32, {}).root), {"version": 1, "leaves": []}


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


async def read_accounts(rpc: Rpc, addresses: list[str], min_slot: int | None = None, tip_program: Pubkey = TIP) -> tuple[int, list[bytes]]:
    config: dict[str, Any] = {"encoding": "base64", "commitment": "confirmed"}
    if min_slot is not None:
        config["minContextSlot"] = min_slot
    document = await rpc("getMultipleAccounts", [addresses, config])
    result = document.get("result") or {}
    values, slot = result.get("value"), (result.get("context") or {}).get("slot")
    if (document.get("error") or not isinstance(values, list) or len(values) != len(addresses)
            or type(slot) is not int or slot < (min_slot or 0)):
        raise RuntimeError("GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE: TIP confirmed account batch is unavailable")
    decoded = []
    for value in values:
        if (not isinstance(value, dict) or value.get("owner") != str(tip_program) or value.get("executable") is not False
                or not isinstance(value.get("data"), list) or len(value["data"]) != 2 or value["data"][1] != "base64"):
            raise ValueError("TIP confirmed account owner or encoding is invalid")
        decoded.append(base64.b64decode(value["data"][0], validate=True))
    return slot, decoded


async def ensure_tip_snapshot(directory: Path, expected_root: str, rpc: Rpc, *, publish_snapshot: bool = True, tip_program: Pubkey = TIP) -> dict:
    """Called before proving; incomplete history and changed roots remain errors."""
    route_root = Pubkey.find_program_address([b"tip:route-merkle-root:v1"], tip_program)[0]
    expected_root = hex_field(field_hex(expected_root))
    target = directory / f"tip-{expected_root}.json"
    if target.is_file():
        snapshot = await asyncio.to_thread(_read_snapshot, target)
        leaves = await asyncio.to_thread(validate_snapshot, snapshot, expected_root)
        return {"published": False, "routeCount": len(leaves)}
    slot, accounts = await read_accounts(rpc, [str(route_root)], tip_program=tip_program)
    root, count = decode_root(accounts[0], tip_program)
    if root != expected_root:
        raise RuntimeError("GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE: TIP route root changed before snapshot synchronization")
    if count > MAX_ROUTES:
        raise ValueError("TIP automatic snapshot synchronization exceeds the 10000-route limit")
    base_root, base = await asyncio.to_thread(select_base, directory, count)
    base_count = len(base["leaves"])
    missing: dict[int, str] = {}
    seen = set()
    before = None
    for _ in range(100):
        options = {"limit": 100, "minContextSlot": slot, "commitment": "confirmed"}
        if before:
            options["before"] = before
        document = await rpc("getSignaturesForAddress", [str(route_root), options])
        entries = document.get("result")
        if document.get("error") or not isinstance(entries, list) or len(entries) > 100:
            raise RuntimeError("GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE: TIP confirmed history is unavailable")
        if not entries:
            break
        for entry in entries:
            if not isinstance(entry, dict):
                raise ValueError("TIP history entry is invalid")
            signature = entry.get("signature")
            entry_slot = entry.get("slot")
            if not isinstance(signature, str) or signature in seen or type(entry_slot) is not int:
                raise ValueError("TIP history repeats a receipt or contains invalid metadata")
            seen.add(signature)
            if entry_slot > slot or entry.get("err") is not None:
                continue
            document = await rpc("getTransaction", [signature, {
                "encoding": "jsonParsed", "commitment": "confirmed", "maxSupportedTransactionVersion": 1,
            }])
            receipt = document.get("result")
            if document.get("error") or not isinstance(receipt, dict):
                raise RuntimeError("GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE: TIP creation history receipt is missing")
            for index, registry in receipt_appends(receipt, signature, entry_slot, tip_program):
                if index >= count:
                    raise ValueError("TIP history exceeds the selected route count")
                if index >= base_count:
                    if index in missing or registry in missing.values():
                        raise ValueError("TIP history repeats a creation index or registry")
                    missing[index] = registry
            if len(missing) == count - base_count:
                break
        if len(missing) == count - base_count:
            break
        before = entries[-1]["signature"]
    if set(missing) != set(range(base_count, count)):
        raise RuntimeError("GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE: confirmed TIP append history is incomplete")
    leaves = []
    for start in range(base_count, count, 100):
        addresses = [missing[index] for index in range(start, min(start + 100, count))]
        _, accounts = await read_accounts(rpc, addresses, slot, tip_program)
        leaves.extend(await asyncio.to_thread(lambda: [decode_registry(address, data, tip_program) for address, data in zip(addresses, accounts)]))
    candidate = await asyncio.to_thread(extend_snapshot, base, base_root, leaves, root, count)
    _, accounts = await read_accounts(rpc, [str(route_root)], slot, tip_program)
    if decode_root(accounts[0], tip_program) != (root, count):
        raise RuntimeError("GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE: TIP route root changed during snapshot synchronization")
    if publish_snapshot:
        await asyncio.to_thread(publish, directory, root, candidate)
    return {"published": publish_snapshot, "routeCount": count}


