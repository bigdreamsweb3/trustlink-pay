"""_coordinate_private_credit_work: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from app.solana_pubkey import Pubkey
import hashlib
import httpx
import os
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    _parse_signed_tcap_deposit_instructions: Callable[..., Any]
    _private_coordination_pending: Any
    _select_tcap_private_funding_deposit: Callable[..., Any]
    clean_env: Callable[..., Any]
    read_epoch: Callable[..., Any]
    receiver_request: Callable[..., Any]
    solana_rpc: Callable[..., Any]


async def _coordinate_private_credit_work(node: Dependencies, client: httpx.AsyncClient, headers: dict[str,str]) -> None:
    pass  # Mutable state belongs to the explicit Node runtime.
    inventory, cursor, seen = [], "", set()
    while True:
        response = await node.receiver_request(client, "GET", "/api/internal/node/coordination",
            headers=headers, params={"after": cursor})
        response.raise_for_status()
        page = response.json()
        inventory.extend(page["work"])
        cursor = page.get("nextCursor")
        if not cursor: break
        if cursor in seen: raise ValueError("PRIVATE_CREDIT_CURSOR_REPEATED")
        seen.add(cursor)
    node._private_coordination_pending = any(w.get("status") in ("RECEIVED","NODE_VERIFYING","VERIFIED","CRANKER_LEASED")
        and w.get("kind") != "AUTHORIZED_FUNDING" for w in inventory)
    if not node.clean_env(os.environ.get("GPRU_HIDDEN_HEAD_WITNESS_DIR")): return
    grouped = {}
    for funding in inventory:
        if funding.get("kind") != "AUTHORIZED_FUNDING" or funding.get("status") != "CONFIRMED": continue
        if not isinstance((funding.get("payload") or {}).get("fundingNote"), dict): continue
        instructions = node._parse_signed_tcap_deposit_instructions(funding["payload"]["senderSignedFundingTransaction"])
        accounts = node._select_tcap_private_funding_deposit(instructions)[1]
        grouped[accounts[2]] = {"assetEntry": accounts[2], "reserveState": accounts[3], "tcapConfig": accounts[1]}
    for asset_entry, payload in grouped.items():
        epoch = await node.read_epoch(node.solana_rpc, asset_entry, payload["reserveState"])
        if epoch["count"] < 2: continue
        node._private_coordination_pending = True
        slot = int((await node.solana_rpc("getSlot", [{"commitment":"confirmed"}])).get("result") or 0)
        if epoch["count"] < 64 and slot - epoch["started"] < 120: continue
        body = {**payload, "accountingEpoch": epoch["address"]}
        key = hashlib.sha256(bytes(Pubkey.from_string(epoch["address"]))).hexdigest()
        identifier = f"tcap-epoch-{key}"
        if any(w["id"] == identifier for w in inventory): continue
        response = await node.receiver_request(client,"POST","/api/internal/node/coordination",headers=headers,
            json={"id":identifier,"kind":"TCAP_EPOCH_ACCOUNTING","payload":body})
        response.raise_for_status()
