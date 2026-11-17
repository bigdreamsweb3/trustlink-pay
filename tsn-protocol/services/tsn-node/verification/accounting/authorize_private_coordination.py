"""_authorize_private_coordination: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from fastapi import HTTPException
from pathlib import Path
import asyncio
import os
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_PROGRAM_ID: Any
    _assert_current_settlement_lease: Callable[..., Any]
    _assert_stored_settlement_attestation: Callable[..., Any]
    _parse_solana_v1_message: Callable[..., Any]
    _public_coordination: Callable[..., Any]
    _receiver_verified_payload: Callable[..., Any]
    _receiver_work_by_id: Callable[..., Any]
    build_epoch_witness: Callable[..., Any]
    clean_env: Callable[..., Any]
    epoch_credits: Callable[..., Any]
    prove_epoch: Callable[..., Any]
    read_epoch: Callable[..., Any]
    solana_rpc: Callable[..., Any]


async def _authorize_private_coordination(node: Dependencies, work: dict, operator: str) -> dict:
    value = (node._receiver_verified_payload(work) or {}).get("tcapEpochAccounting")
    if not isinstance(value,dict): raise HTTPException(422,"PRIVATE_COORDINATION_TRANSITION_MISSING")
    value = node._public_coordination(work["kind"], value)
    node._assert_stored_settlement_attestation(work,value)
    directory = Path(node.clean_env(os.environ.get("GPRU_HIDDEN_HEAD_WITNESS_DIR")))
    epoch = await node.read_epoch(node.solana_rpc,value["assetEntry"],value["reserveState"])
    if epoch["address"] != value["accountingEpoch"]: raise HTTPException(409,"TCAP_EPOCH_ALREADY_ACCOUNTED")
    credits = await node.epoch_credits(node.solana_rpc,epoch,node._parse_solana_v1_message,node.TSN_PROGRAM_ID)
    witness = await asyncio.to_thread(node.build_epoch_witness,epoch,credits,directory)
    if str(witness["total"]) != value["total"]: raise HTTPException(403,"TCAP_EPOCH_TOTAL_MISMATCH")
    if await node.prove_epoch(witness,node.solana_rpc,existing_proof=value["proof"]) != value["proof"]:
        raise HTTPException(403,"TCAP_EPOCH_PROOF_MISMATCH")
    current = await node._receiver_work_by_id(work["id"])
    node._assert_current_settlement_lease(current,operator)
    if current["stateVersion"] != work["stateVersion"]: raise HTTPException(409,"PRIVATE_COORDINATION_LEASE_CHANGED")
    lease = current["crankerLease"]
    return {"kind":"TSN_TCAP_COORDINATION_AUTHORIZATION_V1","transition":value,"workStateVersion":current["stateVersion"],
        "leaseId":lease.get("leaseId") or current["id"],"leaseVersion":lease.get("version") or current["stateVersion"],
        "leaseExpiresAt":lease["expiresAt"],"expiresAtTs":int(datetime.fromisoformat(lease["expiresAt"].replace("Z","+00:00")).timestamp())}
