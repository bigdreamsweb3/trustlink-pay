"""_verify_private_coordination_work: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from pathlib import Path
from private_credit_coordination import PrivateCreditWait
import asyncio
import os
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_PROGRAM_ID: Any
    _parse_solana_v1_message: Callable[..., Any]
    build_epoch_witness: Callable[..., Any]
    clean_env: Callable[..., Any]
    epoch_credits: Callable[..., Any]
    prove_epoch: Callable[..., Any]
    read_epoch: Callable[..., Any]
    solana_rpc: Callable[..., Any]


async def _verify_private_coordination_work(node: Dependencies, work: dict) -> dict:
    payload = work["payload"]; directory = Path(node.clean_env(os.environ.get("GPRU_HIDDEN_HEAD_WITNESS_DIR")))
    epoch = await node.read_epoch(node.solana_rpc,payload["assetEntry"],payload["reserveState"])
    if epoch["address"] != payload["accountingEpoch"]: raise ValueError("TCAP_EPOCH_ALREADY_ACCOUNTED")
    if epoch["count"] < 2: raise PrivateCreditWait("TCAP_EPOCH_REQUIRES_COMPLETE_GROUP")
    credits = await node.epoch_credits(node.solana_rpc,epoch,node._parse_solana_v1_message,node.TSN_PROGRAM_ID)
    witness = await asyncio.to_thread(node.build_epoch_witness,epoch,credits,directory)
    proof = await node.prove_epoch(witness,node.solana_rpc)
    value = {**payload,"total":str(witness["total"]),"proof":proof}
    return {"verifiedPayload":{"tcapEpochAccounting":value},"verificationType":"TSN_TCAP_EPOCH_ACCOUNTING_V1"}
