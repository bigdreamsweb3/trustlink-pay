"""create_settlement_authorization: extracted async component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from fastapi import Depends
from fastapi import HTTPException
from hidden_head_prover import PUBLIC_SIGNALS
from pathlib import Path
from typing import Any
import os
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    _assert_authorized_credit_preconditions: Callable[..., Any]
    _assert_current_settlement_lease: Callable[..., Any]
    _assert_stored_settlement_attestation: Callable[..., Any]
    _assert_tcap_credit_transport_capacity: Callable[..., Any]
    _authorize_private_coordination: Callable[..., Any]
    _public_tcap_transition: Callable[..., Any]
    _read_gpru_proof_accounts: Callable[..., Any]
    _receiver_verified_payload: Callable[..., Any]
    _receiver_work_by_id: Callable[..., Any]
    _settlement_funding_context: Callable[..., Any]
    _validate_tcap_credit_digest: Callable[..., Any]
    clean_env: Callable[..., Any]
    prove_hidden_head_credit: Callable[..., Any]
    read_opening: Callable[..., Any]


async def create_settlement_authorization(node: Dependencies, body: dict[str, Any]) -> dict[str, Any]:
    """Reverify the exact stored transition for the current Cranker lease."""
    work_id, operator = str(body.get("workId") or ""), str(body.get("crankerPubkey") or "")
    if not work_id or not operator:
        raise HTTPException(422, "workId and crankerPubkey are required")
    work = await node._receiver_work_by_id(work_id)
    node._assert_current_settlement_lease(work, operator)
    if work["kind"] == "TIN_DEBIT":
        from settlement.debit.authorize import authorize_debit
        return await authorize_debit(node, work, operator)
    if work["kind"] == "TCAP_EPOCH_ACCOUNTING":
        return await node._authorize_private_coordination(work, operator)
    if (work.get("verification") or {}).get("verificationType") != "TSN_TCAP_GPRU_HIDDEN_HEAD_V1":
        raise HTTPException(403, "Settlement has no Node-verified hidden-head transition")
    verified = node._receiver_verified_payload(work) or {}
    transition = verified.get("tcapCreditTransition")
    if not isinstance(transition, dict):
        raise HTTPException(422, "Settlement has no stored TCAP transition")
    node._assert_stored_settlement_attestation(work, transition)
    node._assert_tcap_credit_transport_capacity(str(transition.get("memoPayload") or ""))
    funding_id = str((work.get("payload") or {}).get("intentId") or "")
    funding = await node._receiver_work_by_id(funding_id)
    _, asset, context = await node._settlement_funding_context(funding)
    opening = node.read_opening(Path(node.clean_env(os.environ.get("GPRU_HIDDEN_HEAD_WITNESS_DIR"))), transition["amountCommitment"])
    if (transition.get("nullifier") != context["nullifier"] or opening["amount"] != context["depositAmountBaseUnits"] or opening["nullifier"] != context["nullifier"]
            or transition.get("tokenId") != asset["tokenId"] or transition.get("assetEntry") != asset["assetEntry"]
            or transition.get("reserveState") != context["depositAccounts"]["reserveState"] or transition.get("tcapConfig") != context["depositAccounts"]["config"]):
        raise HTTPException(403, "Settlement transition differs from its confirmed funding")
    node._validate_tcap_credit_digest(transition)
    await node._assert_authorized_credit_preconditions(transition)
    tip_root, verifier_data, verifier_bump = await node._read_gpru_proof_accounts()
    proof = transition["proof"]
    if proof["publicInputs"][5] != tip_root:
        raise HTTPException(409, "TIP route root changed since settlement verification")
    witness = {name: int(value, 16) for name, value in zip(PUBLIC_SIGNALS, proof["publicInputs"])}
    witness.update(assetId=asset["tokenId"], amount=int(context["depositAmountBaseUnits"]), amountCommitment=int(transition["amountCommitment"],16), authorizationCommitment=int(proof["authorizationCommitment"], 16))
    checked = await node.prove_hidden_head_credit(witness, verifier_data, verifier_bump, existing_proof=proof)
    if checked != proof:
        raise HTTPException(403, "Stored TCAP proof differs from the locally verified proof")
    await node._assert_authorized_credit_preconditions(transition)
    current = await node._receiver_work_by_id(work_id)
    node._assert_current_settlement_lease(current, operator)
    if (current.get("stateVersion") != work.get("stateVersion")
            or current.get("crankerLease") != work.get("crankerLease")):
        raise HTTPException(409, "Settlement lease changed during proof verification")
    lease = current["crankerLease"]
    expires_at_ts = int(datetime.fromisoformat(lease["expiresAt"].replace("Z", "+00:00")).timestamp())
    if expires_at_ts <= int(datetime.now(timezone.utc).timestamp()):
        raise HTTPException(409, "Settlement lease has insufficient time for authorization")
    return {
        "kind": "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V3",
        "transition": node._public_tcap_transition(transition), "workStateVersion": current["stateVersion"],
        "leaseId": lease.get("leaseId") or current["id"],
        "leaseVersion": lease.get("version") or current["stateVersion"],
        "leaseExpiresAt": lease["expiresAt"], "expiresAtTs": expires_at_ts,
    }
