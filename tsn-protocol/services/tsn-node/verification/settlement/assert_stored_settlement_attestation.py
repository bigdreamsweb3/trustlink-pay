"""_assert_stored_settlement_attestation: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from fastapi import HTTPException
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey
from typing import Any
import base64
import binascii
import hashlib
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    _node_verification_message: Callable[..., Any]
    _node_verification_signing_key: Callable[..., Any]
    _public_coordination: Callable[..., Any]
    _public_tcap_transition: Callable[..., Any]
    _stable_verification_json: Callable[..., Any]


def _assert_stored_settlement_attestation(node: Dependencies, work: dict[str, Any], transition: dict[str, Any]) -> None:
    """Prevent replacing an already verified proof with another valid route's proof."""
    attestation = (work.get("verification") or {}).get("nodeAttestation")
    if not isinstance(attestation, dict):
        raise HTTPException(403, "Settlement Node attestation is missing")
    public_key = bytes(node._node_verification_signing_key().verify_key)
    field = {"SETTLEMENT":"tcapCreditTransition", "TCAP_EPOCH_ACCOUNTING":"tcapEpochAccounting", "TIN_DEBIT":"tcapTinDebitTransition"}[work["kind"]]
    if work["kind"] == "TIN_DEBIT":
        from settlement.debit.public_transition import public_debit_transition
        execution = {field: public_debit_transition(transition)}
    else:
        execution = {field: node._public_tcap_transition(transition) if work["kind"] == "SETTLEMENT" else node._public_coordination(work["kind"], transition)}
    commitment = hashlib.sha256(node._stable_verification_json(execution).encode("utf-8")).hexdigest()
    if (attestation.get("version") != 1 or attestation.get("algorithm") != "Ed25519"
            or attestation.get("workId") != work.get("id") or attestation.get("workKind") != work["kind"]
            or attestation.get("decision") != "VERIFIED" or attestation.get("inputPayloadCommitment") != work.get("payloadCommitment")
            or attestation.get("verificationType") != {"SETTLEMENT":"TSN_TCAP_GPRU_HIDDEN_HEAD_V1","TCAP_EPOCH_ACCOUNTING":"TSN_TCAP_EPOCH_ACCOUNTING_V1", "TIN_DEBIT":"TSN_TIN_DEBIT_V1"}[work["kind"]]
            or attestation.get("keyId") != hashlib.sha256(public_key).hexdigest()[:24]
            or attestation.get("executionPayloadCommitment") != commitment):
        raise HTTPException(403, "Settlement proof does not match the Node-attested execution payload")
    try:
        signature = base64.b64decode(attestation.get("signatureBase64") or "", validate=True)
        VerifyKey(public_key).verify(node._node_verification_message(attestation), signature)
    except (ValueError, TypeError, binascii.Error, BadSignatureError) as exc:
        raise HTTPException(403, "Settlement Node attestation signature is invalid") from exc
