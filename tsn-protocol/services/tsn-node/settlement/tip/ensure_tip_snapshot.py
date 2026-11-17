"""ensure_tip_snapshot implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from settlement.tip.tip_contract import MAX_ROUTES
from pathlib import Path
from app.solana_pubkey import Pubkey
from settlement.tip.tip_contract import Rpc
from settlement.tip.tip_contract import TIP
from settlement.witness._read_snapshot import _read_snapshot
import asyncio
from settlement.tip.decode_root import decode_root
from settlement.tip.extend_snapshot import extend_snapshot
from settlement.witness.field_hex import field_hex
from settlement.witness.hex_field import hex_field
from settlement.tip.publish import publish
from settlement.tip.read_accounts import read_accounts
from settlement.tip.receipt_appends import receipt_appends
from settlement.tip.select_base import select_base
from settlement.tip.validate_snapshot import validate_snapshot
from settlement.tip.decode_registries import decode_registries

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
        leaves.extend(await asyncio.to_thread(decode_registries, addresses, accounts, tip_program))
    candidate = await asyncio.to_thread(extend_snapshot, base, base_root, leaves, root, count)
    _, accounts = await read_accounts(rpc, [str(route_root)], slot, tip_program)
    if decode_root(accounts[0], tip_program) != (root, count):
        raise RuntimeError("GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE: TIP route root changed during snapshot synchronization")
    if publish_snapshot:
        await asyncio.to_thread(publish, directory, root, candidate)
    return {"published": publish_snapshot, "routeCount": count}
