"""Recheck the stored proof, current roots and lease before Mother approval."""
from datetime import datetime
from .read_context import read_debit_context
from .public_transition import public_debit_transition
from .contract import PUBLIC_FIELDS
from .prove import prove_debit
from .wire import debit_instructions
from fastapi import HTTPException


from typing import Any, Callable, Protocol


class Dependencies(Protocol):
    TSN_PROGRAM_ID: str
    TCAP_PROGRAM_ID: str
    GPRU_PROGRAM_ID: str
    TINS_PROGRAM_ID: str
    TOKEN_PROGRAM_ID: Any
    TOKEN_2022_PROGRAM_ID: Any
    solana_rpc: Callable[..., Any]
    get_mother_escrow_pda: Callable[..., Any]
    _receiver_verified_payload: Callable[..., Any]
    _assert_stored_settlement_attestation: Callable[..., Any]
    _receiver_work_by_id: Callable[..., Any]
    _assert_current_settlement_lease: Callable[..., Any]


async def authorize_debit(node: Dependencies, work: dict, operator: str) -> dict:
    value = public_debit_transition((node._receiver_verified_payload(work) or {})["tcapTinDebitTransition"])
    node._assert_stored_settlement_attestation(work, value)
    payload = work["payload"]
    context = await read_debit_context(node, payload["tokenMintAddress"])
    inputs = value["proof"]["publicInputs"]
    if (context["oldRoot"] != inputs[0] or context["rootSequence"] != int(inputs[3], 16)
        or context["tipRoot"] != inputs[2] or not int(inputs[6], 16) <= context["slot"] <= int(inputs[7], 16)):
        raise HTTPException(409, "TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT")
    witness = {}
    cursor = 0
    for name in PUBLIC_FIELDS:
        count = 2 if name in PUBLIC_FIELDS[12:] else 1
        values = [int(v, 16) for v in inputs[cursor:cursor + count]]
        witness[name] = values if count == 2 else values[0]
        cursor += count
    if await prove_debit(witness, context["verifier"], context["verifierBump"], value["proof"]) != value["proof"]:
        raise HTTPException(403, "TIN_DEBIT_STORED_PROOF_CHANGED")
    debit_instructions(node, value)
    refreshed = await read_debit_context(node, payload["tokenMintAddress"], context["slot"])
    if any(refreshed[name] != context[name] for name in ("oldRoot", "rootSequence", "tipRoot", "verifier", "deploymentCommitment")) or not int(inputs[6], 16) <= refreshed["slot"] <= int(inputs[7], 16):
        raise HTTPException(409, "TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT")
    current = await node._receiver_work_by_id(work["id"])
    node._assert_current_settlement_lease(current, operator)
    if current["stateVersion"] != work["stateVersion"] or current["crankerLease"] != work["crankerLease"]:
        raise HTTPException(409, "TIN_DEBIT_LEASE_CHANGED")
    lease = current["crankerLease"]
    return {"kind": "TSN_TCAP_GPRU_TIN_DEBIT_AUTHORIZATION_V1", "transition": value, "workStateVersion": current["stateVersion"],
        "leaseId": lease.get("leaseId") or current["id"], "leaseVersion": lease.get("version") or current["stateVersion"],
        "leaseExpiresAt": lease["expiresAt"], "expiresAtTs": int(datetime.fromisoformat(lease["expiresAt"].replace("Z", "+00:00")).timestamp())}
