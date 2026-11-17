"""ensure_funding_snapshot implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from settlement.funding.funding_contract import MAX_LEAVES
from settlement.funding.funding_contract import MAX_SIGNATURES
from pathlib import Path
from settlement.funding.funding_contract import Rpc
from settlement.funding.funding_contract import TCAP_PROGRAM
from settlement.witness._read_snapshot import _read_snapshot
from settlement.funding.decode_append_events import decode_append_events
from settlement.funding.funding_root_address import funding_root_address
from settlement.funding.publish_snapshot import publish_snapshot
from settlement.funding.read_funding_root import read_funding_root
from settlement.funding.select_base import select_base
from settlement.funding.select_funding_root import select_funding_root
from settlement.funding.validate_snapshot import validate_snapshot

async def ensure_funding_snapshot(directory: Path, selected: dict[str, Any], rpc: Rpc, program: str = TCAP_PROGRAM) -> dict[str, Any]:
    root, count = selected["root"], selected["count"]
    address = str(funding_root_address(program)[0])
    if selected["address"] != address or not 0 < count <= MAX_LEAVES:
        raise ValueError("TCAP funded membership requires a nonempty supported canonical root")
    path = directory / f"funding-{root}.json"
    if path.is_file():
        leaves = validate_snapshot(_read_snapshot(path), root, count)
        select_funding_root(await read_funding_root(rpc, program), root, count)
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
    select_funding_root(await read_funding_root(rpc, program), root, count)
    publish_snapshot(directory, root, leaves)
    return {"root": root, "leaves": leaves, "published": True}
