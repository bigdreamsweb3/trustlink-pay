"""_sign_node_verification: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from typing import Any
import base64
import hashlib
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TSN_NODE_ID: Any
    _node_verification_message: Callable[..., Any]
    _node_verification_signing_key: Callable[..., Any]
    _public_coordination: Callable[..., Any]
    _public_tcap_transition: Callable[..., Any]
    _stable_verification_json: Callable[..., Any]


def _sign_node_verification(node: Dependencies,
    *, work: dict[str, Any], status: str, evidence: dict[str, Any], verification_type: str,
) -> dict[str, Any]:
    key = node._node_verification_signing_key()
    public_key = bytes(key.verify_key)
    lease = work.get("nodeLease") or {}
    verified_payload = evidence.get("verifiedPayload")
    if status == "VERIFIED" and isinstance(verified_payload, dict):
        allowed = {
            # Keep this projection in sync with Receiver's crankerExecutionPayload:
            # funding execution only needs the immutable owner-signed deposit
            # and its funding mode and validated RPC routing context. Other payment fields
            # are evidence, not Cranker execution inputs.
            "AUTHORIZED_FUNDING": {"senderSignedFundingTransaction", "senderFundingMode", "senderFundingBlockhashContext"},
            "SETTLEMENT": {"tcapCreditTransition"},
            "TIN_DEBIT": {"tcapTinDebitTransition"},
            "TCAP_EPOCH_ACCOUNTING": {"tcapEpochAccounting"},
            "TIN_OPERATION": {
                "intentId", "intentType", "ownerPubkey", "ownerSignature", "ownerIntentHash",
                "ownerIntentMessage", "ownerSignatureMessageFormat", "expiry", "nonce",
                "lookupCommitment", "encryptedIdentityEnvelope", "encryptedTinRecovery", "encryptedMasterSeed", "encryptedMetadataHash",
                "routeVersion", "routeNonce",
                "tipRouteVersion", "gpruElgamalKeyVersion", "gpruElgamalPublicKey",
                "gpruElgamalKeyCommitment", "gpruBalanceScanKeyVersion",
                "gpruBalanceScanPublicKeyX", "gpruBalanceScanPublicKeyY", "policyCommitment",
            },
        }.get(str(work.get("kind") or ""), set())
        execution_payload = {name: verified_payload[name] for name in allowed if name in verified_payload}
        if work.get("kind") == "SETTLEMENT" and isinstance(execution_payload.get("tcapCreditTransition"), dict):
            execution_payload["tcapCreditTransition"] = node._public_tcap_transition(execution_payload["tcapCreditTransition"])
        if work.get("kind") == "TIN_DEBIT":
            from settlement.debit.public_transition import public_debit_transition
            execution_payload["tcapTinDebitTransition"] = public_debit_transition(execution_payload["tcapTinDebitTransition"])
        for kind, field in (("TCAP_EPOCH_ACCOUNTING", "tcapEpochAccounting"),):
            if work.get("kind") == kind and isinstance(execution_payload.get(field), dict):
                execution_payload[field] = node._public_coordination(kind, execution_payload[field])
    else:
        execution_payload = {}
    attestation: dict[str, Any] = {
        "version": 1,
        "algorithm": "Ed25519",
        "workId": str(work.get("id") or ""),
        "workKind": str(work.get("kind") or ""),
        "decision": status,
        "inputPayloadCommitment": str(work.get("payloadCommitment") or "").lower(),
        "evidenceCommitment": hashlib.sha256(node._stable_verification_json(evidence).encode("utf-8")).hexdigest(),
        "executionPayloadCommitment": hashlib.sha256(node._stable_verification_json(execution_payload).encode("utf-8")).hexdigest(),
        "verificationType": verification_type,
        "leaseId": str(lease.get("leaseId") or ""),
        "leaseVersion": int(lease.get("version") or work.get("stateVersion") or 0),
        "nodeId": node.TSN_NODE_ID,
        "keyId": hashlib.sha256(public_key).hexdigest()[:24],
        "signedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    attestation["signatureBase64"] = base64.b64encode(key.sign(node._node_verification_message(attestation)).signature).decode("ascii")
    attestation["signerPublicKeyBase64"] = base64.b64encode(public_key).decode("ascii")
    return attestation
