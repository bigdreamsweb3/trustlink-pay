"""Validate durable private readiness and the original Node signature before using its accounts."""
from __future__ import annotations
import base64
import hashlib
from datetime import datetime, timezone
from typing import Any, Callable, Protocol
from nacl.signing import VerifyKey


class Dependencies(Protocol):
    _node_verification_message: Callable[..., Any]
    _node_verification_signing_key: Callable[..., Any]
    _stable_verification_json: Callable[..., Any]


def funding_authorization_preflight(node: Dependencies, work: dict[str, Any], *, check_ready_expiry: bool = True) -> dict[str, Any]:
    preflight = work.get("authorizationPreflight")
    stored_readiness = work.get("fundingReadiness") or {}
    readiness = {name: stored_readiness.get(name) for name in ("expiresAt", "authorizationPayloadCommitment")}
    attestation = work.get("fundingReadinessAttestation") or {}
    commitment = str(work.get("authorizationPayloadCommitment") or "")
    if (not isinstance(preflight, dict) or not commitment
        or preflight.get("authorizationPayloadCommitment") != commitment
        or readiness.get("authorizationPayloadCommitment") != commitment
        or attestation.get("inputPayloadCommitment") != commitment
        or attestation.get("workId") != work.get("id")
        or attestation.get("workKind") != "AUTHORIZED_FUNDING"
        or attestation.get("decision") != "FUNDING_READY"
        or attestation.get("verificationType") != "TSN_FUNDING_AUTHORIZATION_READY"):
        raise ValueError("Funding readiness differs from its original authorization")
    try:
        evidence = {"verificationType": "TSN_FUNDING_AUTHORIZATION_READY", "fundingReadiness": readiness,
            "authorizationPreflight": preflight, "receiverLease": work.get("fundingReadinessReceiverLease")}
        if hashlib.sha256(node._stable_verification_json(evidence).encode("utf-8")).hexdigest() != attestation.get("evidenceCommitment"):
            raise ValueError("Funding readiness evidence was changed")
        key = base64.b64decode(attestation["signerPublicKeyBase64"], validate=True)
        if key != bytes(node._node_verification_signing_key().verify_key):
            raise ValueError("Untrusted funding readiness signer")
        VerifyKey(key).verify(node._node_verification_message(attestation), base64.b64decode(attestation["signatureBase64"], validate=True))
        expiry = datetime.fromisoformat(str(readiness["expiresAt"]).replace("Z", "+00:00"))
        if expiry.tzinfo is None or check_ready_expiry and expiry <= datetime.now(timezone.utc):
            raise ValueError("Funding readiness has expired")
    except Exception as exc:
        raise ValueError("Funding readiness signature or validity is invalid") from exc
    payload = work.get("payload") or {}
    fields = preflight.get("verifiedFields") or {}
    if (preflight.get("fundingNoteCommitment") != (payload.get("fundingNote") or {}).get("commitment")
        or (preflight.get("depositAccounts") or {}).get("depositor") != payload.get("senderWallet")
        or (preflight.get("depositAccounts") or {}).get("mint") != payload.get("tokenMintAddress")
        or fields.get("senderAuthorizationNonce") != payload.get("senderAuthorizationNonce")):
        raise ValueError("Funding preparation no longer matches the signed intent")
    return preflight
