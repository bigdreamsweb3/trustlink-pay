"""Reconstruct public funded-note membership from the chain-selected TCAP root.

No private openings are saved. Receipts provide append indices and commitments;
recomputed root/count equality, followed by a fresh chain read, selects authority.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import secrets
from pathlib import Path
from typing import Any, Awaitable, Callable

from app.solana_pubkey import Pubkey
from funding_note import funded_leaf
from hidden_head_witness import SparseTree, _read_snapshot, field, field_hex, hex_field

TCAP_PROGRAM = "tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF"
ROOT_SEED = b"tcap:funding-root:v1"
MAX_LEAVES = 10_000
MAX_SIGNATURES = 10_000
FUNDING_ROOT_CHANGED = "TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT"
Rpc = Callable[[str, list[Any]], Awaitable[dict[str, Any]]]


def funding_root_address(program: str = TCAP_PROGRAM) -> tuple[Pubkey, int]:
    return Pubkey.find_program_address([ROOT_SEED], Pubkey.from_string(program))


def decode_funding_root(account: Any, program: str = TCAP_PROGRAM) -> dict[str, Any]:
    _, bump = funding_root_address(program)
    if not isinstance(account, dict) or account.get("owner") != program:
        raise ValueError("TCAP funding root is missing or has the wrong owner")
    try:
        data = base64.b64decode(account["data"][0], validate=True)
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise ValueError("TCAP funding root encoding is invalid") from exc
    if (len(data) != 1081 or data[:8] != hashlib.sha256(b"account:TcapFundingMerkleRootV1").digest()[:8]
            or int.from_bytes(data[8:10], "little") != 1 or int.from_bytes(data[10:12], "little") != 1
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
    return {"root": root, "count": count}


async def read_funding_root(rpc: Rpc, program: str = TCAP_PROGRAM) -> dict[str, Any]:
    address, _ = funding_root_address(program)
    response = await rpc("getAccountInfo", [str(address), {"encoding": "base64", "commitment": "confirmed"}])
    result = response.get("result") or {}
    decoded = decode_funding_root(result.get("value"), program)
    return {**decoded, "address": str(address), "slot": int((result.get("context") or {}).get("slot") or 0)}


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


def validate_snapshot(snapshot: Any, root: str, count: int) -> list[int]:
    if (not isinstance(snapshot, dict) or set(snapshot) != {"version", "leaves"}
            or type(snapshot.get("version")) is not int or snapshot["version"] != 1
            or not isinstance(snapshot["leaves"], list)):
        raise ValueError("TCAP funding snapshot has an unsupported field set")
    leaves = [field(v) for v in snapshot["leaves"]]
    if len(leaves) != count or count > MAX_LEAVES or any(v == 0 for v in leaves):
        raise ValueError("TCAP funding snapshot count or leaves are invalid")
    if SparseTree(32, dict(enumerate(leaves))).root != field_hex(root):
        raise ValueError("TCAP funding snapshot does not match the chain-selected root")
    return leaves


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


def select_base(directory: Path, count: int) -> list[int]:
    """A cached prefix is usable only if the extended tree matches chain state."""
    candidates = []
    for path in directory.glob("funding-*.json"):
        if not re.fullmatch(r"funding-[0-9a-f]{64}\.json", path.name):
            continue
        snapshot = _read_snapshot(path)
        if not isinstance(snapshot, dict) or not isinstance(snapshot.get("leaves"), list):
            raise ValueError("TCAP cached funding snapshot schema is invalid")
        if len(snapshot["leaves"]) < count:
            candidates.append((len(snapshot["leaves"]), path, snapshot))
    if not candidates:
        return []
    size, path, snapshot = max(candidates, key=lambda candidate: candidate[0])
    return validate_snapshot(snapshot, path.stem[8:], size)


async def ensure_funding_snapshot(directory: Path, selected: dict[str, Any], rpc: Rpc, program: str = TCAP_PROGRAM) -> dict[str, Any]:
    root, count = selected["root"], selected["count"]
    address = str(funding_root_address(program)[0])
    if (not selected.get("sealed") and selected["address"] != address) or not 0 < count <= MAX_LEAVES:
        raise ValueError("TCAP funded membership requires a nonempty supported canonical root")
    path = directory / f"funding-{root}.json"
    if path.is_file():
        leaves = validate_snapshot(_read_snapshot(path), root, count)
        return {"root": root, "leaves": leaves, "published": False}
    prefix = select_base(directory, count)
    base_count = len(prefix)
    required = count - base_count
    events: dict[int, dict[str, Any]] = {}
    before = None
    scanned = 0
    while len(events) < required and scanned < MAX_SIGNATURES:
        options: dict[str, Any] = {"commitment": "confirmed", "limit": min(1000, MAX_SIGNATURES - scanned)}
        if before:
            options["before"] = before
        response = await rpc("getSignaturesForAddress", [address, options])
        signatures = response.get("result")
        if not isinstance(signatures, list) or not signatures:
            break
        for item in signatures:
            scanned += 1
            if not isinstance(item, dict) or not isinstance(item.get("signature"), str):
                raise ValueError("TCAP funding history signature is invalid")
            before = item["signature"]
            if item.get("err") is not None:
                continue
            response = await rpc("getTransaction", [before, {"encoding": "json", "commitment": "confirmed", "maxSupportedTransactionVersion": 1}])
            receipt = response.get("result")
            if not isinstance(receipt, dict) or before not in ((receipt.get("transaction") or {}).get("signatures") or []):
                raise ValueError("TCAP funding history receipt is missing or has a mismatched signature")
            for event in decode_append_events(receipt, address, program):
                index = event["index"]
                if index < base_count or index >= count:
                    continue
                if index in events and events[index] != event:
                    raise ValueError("TCAP funding history contains contradictory append indices")
                events[index] = event
            if len(events) == required:
                break
    if set(events) != set(range(base_count, count)):
        raise RuntimeError("TCAP_FUNDED_WITNESS_UNAVAILABLE: complete confirmed append history is required")
    leaves = prefix + [events[i]["leaf"] for i in range(base_count, count)]
    validate_snapshot({"version": 1, "leaves": leaves}, root, count)
    if events[count - 1]["root"] != root:
        raise ValueError("TCAP latest funding append does not match the selected root")
    current = (await read_sealed_pool(rpc, selected["asset"], root, selected["token"], program)
               if selected.get("sealed") else await read_funding_root(rpc, program))
    if (current["root"], current["count"]) != (root, count):
        raise ValueError(FUNDING_ROOT_CHANGED)
    publish_snapshot(directory, root, leaves)
    return {"root": root, "leaves": leaves, "published": True}


def funding_membership(snapshot: dict[str, Any], commitment: str, token_id: int, amount: int) -> dict[str, Any]:
    leaf = funded_leaf(commitment, token_id, amount)
    leaves = snapshot["leaves"]
    if leaf not in leaves:
        raise ValueError("Confirmed deposit has no membership in the selected funding root")
    index = leaves.index(leaf)
    tree = SparseTree(32, dict(enumerate(leaves)))
    if hex_field(tree.root) != snapshot["root"]:
        raise ValueError("Funding membership snapshot root differs")
    return {"fundingRoot": tree.root, "fundingIndex": index, "fundingSiblings": tree.siblings(index)}


POOL_SEED = b"tcap:sealed-funding:v1"

def sealed_pool_address(asset: str, root: str, program: str = TCAP_PROGRAM) -> tuple[Pubkey, int]:
    field_hex(root)
    return Pubkey.find_program_address([POOL_SEED, bytes(Pubkey.from_string(asset)), bytes.fromhex(root)], Pubkey.from_string(program))

async def read_sealed_pool(rpc: Rpc, asset: str, root: str, token: int, program: str = TCAP_PROGRAM) -> dict[str, Any]:
    address, bump = sealed_pool_address(asset, root, program)
    response = await rpc("getAccountInfo", [str(address), {"encoding": "base64", "commitment": "confirmed"}])
    result = response.get("result") or {}
    account = result.get("value")
    if not isinstance(account, dict) or account.get("owner") != program:
        raise ValueError("TCAP_PRIVATE_POOL_NOT_READY")
    data = base64.b64decode(account["data"][0], validate=True)
    if (len(data) != 113 or data[:8] != hashlib.sha256(b"account:TcapSealedFundingPoolV1").digest()[:8]
        or data[8:10] != b"\x01\x00" or data[10] != bump or data[11:43] != bytes(Pubkey.from_string(asset))
        or int.from_bytes(data[43:47], "little") != token or data[47:79].hex() != root):
        raise ValueError("TCAP_PRIVATE_POOL_INVALID")
    count, eligible = (int.from_bytes(data[o:o+8], "little") for o in (79, 87))
    sources = int.from_bytes(data[95:97], "little")
    captured, release = (int.from_bytes(data[o:o+8], "little") for o in (97, 105))
    slot = int((result.get("context") or {}).get("slot") or 0)
    if not 2 <= sources <= eligible <= count <= 1 << 32 or release < captured:
        raise ValueError("TCAP_PRIVATE_POOL_INVALID")
    if slot < release:
        raise ValueError("TCAP_PRIVATE_POOL_NOT_READY")
    return {"root": root, "count": count, "eligible": eligible, "sources": sources, "address": str(address),
            "asset": asset, "token": token, "release": release, "slot": slot, "sealed": True}
