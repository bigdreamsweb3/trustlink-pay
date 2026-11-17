from __future__ import annotations

from .constants import ACCESS_DOMAIN
from .constants import ALLOWED_OPERATIONS
from typing import Any
from nacl.exceptions import BadSignatureError
from .constants import DEVICE_PROOF_DOMAIN
from .constants import DEVICE_PROOF_VERSION
from .constants import MAX_PROOF_LIFETIME_SECONDS
from nacl.signing import VerifyKey
from .constants import WALLET_ACCESS_DOMAIN
from ._base64url_decode import _base64url_decode
from ._canonical_fields import _canonical_fields
from ._canonical_jwk import _canonical_jwk
from ._hash_hex import _hash_hex
from ._parse_time import _parse_time
from ._require_hash import _require_hash
from ._require_string import _require_string
from datetime import datetime
from app.utils.encoding import decode_base58
import json
from datetime import timezone

def verify_threshold_access_request(
    request: dict[str, Any],
    *,
    now: datetime | None = None,
) -> dict[str, str]:
    from .types import ThresholdAccessError
    if request.get("domain") != ACCESS_DOMAIN:
        raise ThresholdAccessError("threshold action request domain is invalid")
    operation = _require_string(request.get("operation"), "operation")
    if operation not in ALLOWED_OPERATIONS:
        raise ThresholdAccessError("threshold action operation is invalid")
    access = request.get("access")
    proof = request.get("deviceAccessProof")
    if not isinstance(access, dict) or not isinstance(proof, dict):
        raise ThresholdAccessError("threshold action access proof is incomplete")

    tin = _require_string(access.get("tin"), "access.tin")
    owner = _require_string(access.get("ownerPublicKey"), "access.ownerPublicKey")
    route_version = access.get("routeVersion")
    if not isinstance(route_version, int) or route_version < 1:
        raise ThresholdAccessError("access.routeVersion must be a positive integer")
    pru_hash = _require_hash(access.get("pruConfigurationHash"), "access.pruConfigurationHash")
    resource = _require_hash(access.get("resourceCommitment"), "access.resourceCommitment")
    session = _require_string(access.get("deviceSessionBinding"), "access.deviceSessionBinding")

    exact_fields = {
        "operation": operation,
        "tin": tin,
        "ownerPublicKey": owner,
        "routeVersion": route_version,
        "pruConfigurationHash": pru_hash,
        "resourceCommitment": resource,
        "deviceSessionBinding": session,
    }
    if proof.get("version") != DEVICE_PROOF_VERSION or proof.get("domain") != DEVICE_PROOF_DOMAIN:
        raise ThresholdAccessError("authorized-device proof version or domain is invalid")
    for field, expected in exact_fields.items():
        actual = proof.get(field)
        if field in {"pruConfigurationHash", "resourceCommitment"} and isinstance(actual, str):
            actual = actual.lower()
        if actual != expected:
            raise ThresholdAccessError(f"authorized-device proof {field} does not match")

    wallet_message = _base64url_decode(
        _require_string(request.get("walletAuthorizationMessageBase64Url"), "wallet authorization message"),
        "wallet authorization message",
    )
    expected_wallet_message = _canonical_fields([
        WALLET_ACCESS_DOMAIN,
        tin,
        owner,
        str(route_version),
        pru_hash,
        resource,
        session,
    ])
    if wallet_message != expected_wallet_message:
        raise ThresholdAccessError("main-wallet authorization message does not match")
    if _hash_hex(wallet_message) != proof.get("walletAuthorizationCommitment"):
        raise ThresholdAccessError("device proof is not bound to the wallet authorization")
    wallet_signature = _base64url_decode(
        _require_string(request.get("walletAuthorizationSignatureBase64Url"), "wallet authorization signature"),
        "wallet authorization signature",
    )
    try:
        owner_key = decode_base58(owner)
        if len(owner_key) != 32:
            raise ValueError("wrong length")
        VerifyKey(owner_key).verify(wallet_message, wallet_signature)
    except (ValueError, BadSignatureError) as exc:
        raise ThresholdAccessError("main-wallet authorization signature is invalid") from exc

    signing_jwk, signing_key = _canonical_jwk(
        proof.get("deviceSigningPublicKey"), "Ed25519", "device signing public key"
    )
    encryption_jwk, _ = _canonical_jwk(
        proof.get("deviceEncryptionPublicKey"), "X25519", "device encryption public key"
    )
    signing_fingerprint = _hash_hex(_canonical_fields([
        "TSN_DEVICE_SIGNING_KEY_V1",
        signing_jwk["kty"],
        signing_jwk["crv"],
        signing_jwk["x"],
    ]))
    encryption_fingerprint = _hash_hex(_canonical_fields([
        "TSN_OWNER_CONTROLLED_ENCRYPTION_KEY_V1",
        "device",
        encryption_jwk["kty"],
        encryption_jwk["crv"],
        encryption_jwk["x"],
    ]))
    if signing_fingerprint != proof.get("deviceSigningKeyFingerprint"):
        raise ThresholdAccessError("device signing-key fingerprint is invalid")
    if encryption_fingerprint != proof.get("deviceEncryptionKeyFingerprint"):
        raise ThresholdAccessError("device encryption-key fingerprint is invalid")
    if not session.endswith(
        f":device:{signing_fingerprint}:encryption:{encryption_fingerprint}"
    ):
        raise ThresholdAccessError("threshold session is not bound to the authorized device")

    issued_at = _parse_time(proof.get("issuedAt"), "proof.issuedAt")
    expires_at = _parse_time(proof.get("expiresAt"), "proof.expiresAt")
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    lifetime = (expires_at - issued_at).total_seconds()
    if (
        lifetime <= 0
        or lifetime > MAX_PROOF_LIFETIME_SECONDS
        or (issued_at - current).total_seconds() > 30
        or expires_at <= current
    ):
        raise ThresholdAccessError("authorized-device proof is expired or invalid")

    canonical_signing_jwk = json.dumps(signing_jwk, separators=(",", ":"))
    canonical_encryption_jwk = json.dumps(encryption_jwk, separators=(",", ":"))
    device_message = _canonical_fields([
        DEVICE_PROOF_DOMAIN,
        DEVICE_PROOF_VERSION,
        operation,
        tin,
        owner,
        str(route_version),
        pru_hash,
        session,
        _require_string(proof.get("deviceId"), "proof.deviceId"),
        signing_fingerprint,
        canonical_signing_jwk,
        encryption_fingerprint,
        canonical_encryption_jwk,
        _require_hash(proof.get("walletAuthorizationCommitment"), "walletAuthorizationCommitment"),
        resource,
        _require_string(proof.get("requestNonce"), "proof.requestNonce"),
        _require_string(proof.get("issuedAt"), "proof.issuedAt"),
        _require_string(proof.get("expiresAt"), "proof.expiresAt"),
    ])
    device_signature = _base64url_decode(
        _require_string(proof.get("signatureBase64Url"), "device signature"),
        "device signature",
    )
    try:
        VerifyKey(signing_key).verify(device_message, device_signature)
    except BadSignatureError as exc:
        raise ThresholdAccessError("authorized-device signature is invalid") from exc

    return {
        "operation": operation,
        "tin": tin,
        "ownerPublicKey": owner,
        "resourceCommitment": resource,
        "requestNonce": str(proof["requestNonce"]),
        "issuedAt": str(proof["issuedAt"]),
        "expiresAt": str(proof["expiresAt"]),
        "deviceId": str(proof["deviceId"]),
    }
