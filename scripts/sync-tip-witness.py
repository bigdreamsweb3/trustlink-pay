"""Extend an ordered TIP snapshot and publish only a confirmed root match.

Registry arguments must be in append order. This reads public accounts and
writes commitment-only local snapshots; it never signs or submits transactions.
"""
from __future__ import annotations

import argparse
import base64
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tsn-protocol/services/tsn-node"))
from app.solana_pubkey import Pubkey
from hidden_head_witness import _read_snapshot, field_hex, hex_field
from tip_snapshot_sync import TIP, ROUTE_ROOT, decode_registry, decode_root, extend_snapshot, publish


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
