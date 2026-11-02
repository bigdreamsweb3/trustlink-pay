"""Extend an ordered TIP snapshot and publish only a confirmed root match.

Registry arguments must be in append order. This reads public accounts and
writes commitment-only local snapshots; it never signs or submits transactions.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import secrets
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tsn-protocol/services/tsn-node"))
from app.solana_pubkey import Pubkey
from gpru_crypto import BABYJUB_FIELD, poseidon_v1
from hidden_head_witness import SparseTree, _point, _read_snapshot, field, field_hex, hex_field

TIP = Pubkey.from_string("TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT")
ROUTE_ROOT, ROOT_BUMP = Pubkey.find_program_address([b"tip:route-merkle-root:v1"], TIP)


def decode_registry(address: str, data: bytes) -> int:
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
    expected_address, expected_bump = Pubkey.find_program_address([b"tin-v1", lookup], TIP)
    if (version != 1 or status != 1 or route_version < 1 or tip_version != 1
            or key_version != 1 or scan_version != 1 or bump != expected_bump
            or str(expected_address) != address or any(data[offset:])
            or any(value == bytes(32) for value in (lookup, public_key, key, x, y, policy))):
        raise ValueError("TIP registry is not an active canonical V1 route")
    if hashlib.sha256(b"TSN_GPRU_ELGAMAL_KEY_COMMITMENT_V1\0" + bytes([key_version]) + public_key).digest() != key:
        raise ValueError("TIP registry ElGamal commitment is invalid")
    _point({"x": str(int.from_bytes(x, "big")), "y": str(int.from_bytes(y, "big"))})
    return poseidon_v1([int.from_bytes(value, "big") % BABYJUB_FIELD for value in (lookup, key, x, y, policy)])


def decode_root(data: bytes) -> tuple[str, int]:
    if len(data) < 1066 or any(data[1066:]) or data[0] != 1 or data[1] != ROOT_BUMP:
        raise ValueError("TIP route root layout is invalid")
    root, count = data[2:34].hex(), int.from_bytes(data[34:42], "little")
    if field_hex(root) == 0 or not 0 < count <= 1 << 32:
        raise ValueError("TIP route root or count is invalid")
    return root, count


def extend_snapshot(snapshot: dict, base_root: str, leaves: list[int], chain_root: str, count: int) -> dict:
    if set(snapshot) != {"version", "leaves"} or snapshot["version"] != 1 or not isinstance(snapshot["leaves"], list):
        raise ValueError("TIP snapshot schema is invalid")
    previous = [field(value) for value in snapshot["leaves"]]
    if not previous or any(value == 0 for value in previous + leaves):
        raise ValueError("TIP ordered leaves must be nonzero")
    if SparseTree(32, dict(enumerate(previous))).root != field_hex(base_root):
        raise ValueError("Base TIP snapshot does not match its root")
    combined = previous + leaves
    if len(combined) != count or SparseTree(32, dict(enumerate(combined))).root != field_hex(chain_root):
        raise ValueError("Extended TIP snapshot does not match the confirmed chain root and count")
    return {"version": 1, "leaves": [str(value) for value in combined]}


def read_accounts(rpc: str, addresses: list[str], min_slot: int | None = None) -> tuple[int, list[bytes]]:
    config = {"encoding": "base64", "commitment": "confirmed"}
    if min_slot is not None:
        config["minContextSlot"] = min_slot
    with httpx.Client(timeout=30) as client:
        response = client.post(rpc, json={"jsonrpc": "2.0", "id": 1, "method": "getMultipleAccounts", "params": [addresses, config]})
        response.raise_for_status()
    document = response.json()
    if document.get("error"):
        raise ValueError("RPC failed to return confirmed TIP accounts")
    result = document["result"]
    values = result["value"]
    if len(values) != len(addresses):
        raise ValueError("RPC returned an incomplete account batch")
    decoded = []
    for value in values:
        if not value or value.get("owner") != str(TIP) or value.get("executable"):
            raise ValueError("TIP account is absent or has an invalid owner")
        if value["data"][1] != "base64":
            raise ValueError("TIP account encoding is invalid")
        decoded.append(base64.b64decode(value["data"][0], validate=True))
    return int(result["context"]["slot"]), decoded


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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rpc", required=True)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--base-root", required=True)
    parser.add_argument("--registry", action="append", required=True, help="New registry, repeated in chain append order")
    parser.add_argument("--write", action="store_true", help="Publish the verified snapshot; default is read-only")
    args = parser.parse_args()
    base_root = hex_field(field_hex(args.base_root))
    if len(set(args.registry)) != len(args.registry):
        raise ValueError("Registry addresses must not repeat")
    for address in args.registry:
        Pubkey.from_string(address)
    snapshot = _read_snapshot(args.directory / f"tip-{base_root}.json")
    slot, accounts = read_accounts(args.rpc, [str(ROUTE_ROOT), *args.registry])
    chain_root, count = decode_root(accounts[0])
    leaves = [decode_registry(address, data) for address, data in zip(args.registry, accounts[1:])]
    candidate = extend_snapshot(snapshot, base_root, leaves, chain_root, count)
    _, current = read_accounts(args.rpc, [str(ROUTE_ROOT)], slot)
    if decode_root(current[0]) != (chain_root, count):
        raise ValueError("TIP root changed while reconstructing the snapshot")
    print(f"TIP snapshot verified: leaves={count} root={chain_root}")
    if args.write:
        print(f"TIP snapshot published: {publish(args.directory, chain_root, candidate).name}")
    else:
        print("Read-only check complete; use --write to publish")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Do not echo RPC URLs, account data or encrypted envelopes in failures.
        print(f"TIP snapshot sync failed: {exc}" if isinstance(exc, ValueError) else f"TIP snapshot sync failed: {type(exc).__name__}", file=sys.stderr)
        sys.exit(1)
