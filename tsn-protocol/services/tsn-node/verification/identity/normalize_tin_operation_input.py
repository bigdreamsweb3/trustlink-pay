"""_normalize_tin_operation_input: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from datetime import datetime
from datetime import timezone
from dbrix_transaction_record import BN254_SCALAR_MODULUS
from fastapi import HTTPException
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey
from typing import Any
from uuid import uuid4
import hashlib
import hmac
import secrets
from typing import Any, Callable, Protocol

class Dependencies(Protocol):
    TINS_LOOKUP_SECRET: Any
    _canonical_tin_owner_intent_message: Callable[..., Any]
    _decode_base64_blob: Callable[..., Any]
    _decode_hash32: Callable[..., Any]
    _decode_owner_pubkey: Callable[..., Any]
    _encode_signed_i64_le: Callable[..., Any]
    _encode_u32_le: Callable[..., Any]
    _expiry_from_input: Callable[..., Any]
    _field: Callable[..., Any]
    _require_string: Callable[..., Any]


def _normalize_tin_operation_input(node: Dependencies, payload: dict[str, Any]) -> dict[str, Any]:
    intent_type = node._require_string(payload, "intent_type", "intentType")
    if intent_type != "tin_creation":
        raise HTTPException(422, "Only current private TIN V1 creation is supported")
    intent_id = str(node._field(payload, "intent_id", "intentId", default=str(uuid4()))).strip()
    if not intent_id:
        raise HTTPException(422, "intent_id must not be empty")
    if str(node._field(payload, "tin", default="") or "").strip():
        raise HTTPException(422, "TIN V1 creation must not submit a plaintext TIN")
    if str(node._field(payload, "display_name", "displayName", default="") or "").strip():
        raise HTTPException(422, "TIN V1 creation must keep the display name encrypted")

    owner_pubkey = node._require_string(payload, "owner_pubkey", "ownerPubkey")
    owner_bytes = node._decode_owner_pubkey(owner_pubkey)
    owner_signature = node._require_string(payload, "owner_signature", "ownerSignature")
    signature_bytes = node._decode_base64_blob(owner_signature, "owner_signature")
    if len(signature_bytes) != 64:
        raise HTTPException(422, "owner_signature must be a 64-byte Ed25519 signature")
    owner_intent_hash = node._require_string(payload, "owner_intent_hash", "ownerIntentHash")
    intent_hash_bytes = node._decode_hash32(owner_intent_hash, "owner_intent_hash")
    nonce = node._require_string(payload, "nonce")
    nonce_bytes = node._decode_hash32(nonce, "nonce")
    expiry = node._expiry_from_input(node._field(payload, "expiry", "expiry_ts", "expiryTs"))

    lookup_commitment = node._require_string(payload, "lookup_commitment", "lookupCommitment")
    lookup_commitment_bytes = node._decode_hash32(lookup_commitment, "lookup_commitment")
    encrypted_identity_envelope = node._require_string(payload, "encrypted_identity_envelope", "encryptedIdentityEnvelope")
    encrypted_identity_bytes = node._decode_base64_blob(encrypted_identity_envelope, "encrypted_identity_envelope")
    encrypted_tin_recovery = node._require_string(payload, "encrypted_tin_recovery", "encryptedTinRecovery")
    encrypted_tin_recovery_bytes = node._decode_base64_blob(encrypted_tin_recovery, "encrypted_tin_recovery")
    encrypted_master_seed = node._require_string(payload, "encrypted_master_seed", "encryptedMasterSeed")
    encrypted_master_seed_bytes = node._decode_base64_blob(encrypted_master_seed, "encrypted_master_seed")
    if not encrypted_identity_bytes or len(encrypted_tin_recovery_bytes) < 28 or not encrypted_master_seed_bytes:
        raise HTTPException(422, "TIN V1 encrypted identity, recovery, and owner seed envelopes are required")

    encrypted_metadata_hash = node._require_string(payload, "encrypted_metadata_hash", "encryptedMetadataHash")
    metadata_hash_bytes = node._decode_hash32(encrypted_metadata_hash, "encrypted_metadata_hash")
    route_version = int(node._field(payload, "route_version", "routeVersion", default=0))
    if route_version != 1:
        raise HTTPException(422, "Current TIN V1 registry version must be 1")
    route_nonce = node._require_string(payload, "route_nonce", "routeNonce")
    route_nonce_bytes = node._decode_hash32(route_nonce, "route_nonce")
    if not secrets.compare_digest(route_nonce_bytes, nonce_bytes):
        raise HTTPException(422, "TIN V1 registry nonce must match the signed operation nonce")
    tip_route_version = int(node._field(payload, "tip_route_version", "tipRouteVersion", default=0))
    if tip_route_version != 1:
        raise HTTPException(422, "Current TIN V1 requires TIP route version 1")
    gpru_elgamal_key_version = int(node._field(payload, "gpru_elgamal_key_version", "gpruElgamalKeyVersion", default=0))
    gpru_elgamal_public_key = node._decode_hash32(node._field(payload, "gpru_elgamal_public_key", "gpruElgamalPublicKey", default=""), "gpru_elgamal_public_key")
    gpru_elgamal_key_commitment = node._decode_hash32(node._field(payload, "gpru_elgamal_key_commitment", "gpruElgamalKeyCommitment", default=""), "gpru_elgamal_key_commitment")
    gpru_balance_scan_key_version = int(node._field(payload, "gpru_balance_scan_key_version", "gpruBalanceScanKeyVersion", default=0))
    gpru_balance_scan_public_key_x = node._decode_hash32(node._field(payload, "gpru_balance_scan_public_key_x", "gpruBalanceScanPublicKeyX", default=""), "gpru_balance_scan_public_key_x")
    gpru_balance_scan_public_key_y = node._decode_hash32(node._field(payload, "gpru_balance_scan_public_key_y", "gpruBalanceScanPublicKeyY", default=""), "gpru_balance_scan_public_key_y")
    policy_commitment = node._decode_hash32(node._field(payload, "policy_commitment", "policyCommitment", default=""), "policy_commitment")
    if gpru_elgamal_key_version != 1 or gpru_balance_scan_key_version != 1 or any(value == bytes(32) for value in (gpru_elgamal_public_key, gpru_elgamal_key_commitment, gpru_balance_scan_public_key_x, gpru_balance_scan_public_key_y, policy_commitment)):
        raise HTTPException(422, "TIP requires nonzero versioned GPRU ElGamal key data and policy commitment")
    scan_x = int.from_bytes(gpru_balance_scan_public_key_x, "big")
    scan_y = int.from_bytes(gpru_balance_scan_public_key_y, "big")
    if scan_x >= BN254_SCALAR_MODULUS or scan_y >= BN254_SCALAR_MODULUS or (
        168700 * scan_x * scan_x + scan_y * scan_y - 1 - 168696 * scan_x * scan_x * scan_y * scan_y
    ) % BN254_SCALAR_MODULUS != 0:
        raise HTTPException(422, "GPRU balance scan public key is not a canonical BabyJubjub point")
    expected_gpru_key_commitment = hashlib.sha256(
        b"TSN_GPRU_ELGAMAL_KEY_COMMITMENT_V1\0" + bytes([gpru_elgamal_key_version]) + gpru_elgamal_public_key
    ).digest()
    if not hmac.compare_digest(expected_gpru_key_commitment, gpru_elgamal_key_commitment):
        raise HTTPException(422, "GPRU ElGamal public key does not match its versioned commitment")

    expected_hash = hashlib.sha256(b"".join([
        b"TSN_TIN_V1_CREATE", owner_bytes, lookup_commitment_bytes,
        node._encode_u32_le(len(encrypted_tin_recovery_bytes)), encrypted_tin_recovery_bytes,
        node._encode_u32_le(len(encrypted_identity_bytes)), encrypted_identity_bytes,
        node._encode_u32_le(len(encrypted_master_seed_bytes)), encrypted_master_seed_bytes,
        metadata_hash_bytes,
        route_version.to_bytes(8, "little", signed=False), route_nonce_bytes, bytes([tip_route_version]),
        bytes([gpru_elgamal_key_version]), gpru_elgamal_public_key,
        gpru_elgamal_key_commitment, bytes([gpru_balance_scan_key_version]),
        gpru_balance_scan_public_key_x, gpru_balance_scan_public_key_y, policy_commitment,
        node._encode_signed_i64_le(expiry),
    ])).digest()
    if not secrets.compare_digest(expected_hash, intent_hash_bytes):
        raise HTTPException(422, "owner_intent_hash does not match the current TIN V1 creation payload")

    if len(node.TINS_LOOKUP_SECRET.encode("utf-8")) < 16:
        raise HTTPException(503, "TIN V1 issuer secret is not configured on the TSN Node")
    issuance_proof = node._decode_hash32(node._field(payload, "lookup_issuance_proof", "lookupIssuanceProof", default=""), "lookup_issuance_proof")
    proof_message = b"".join([b"TSN_TIN_V1_ISSUANCE", owner_bytes, lookup_commitment_bytes, nonce_bytes, intent_hash_bytes, node._encode_signed_i64_le(expiry)])
    expected_issuance_proof = hmac.new(node.TINS_LOOKUP_SECRET.encode("utf-8"), proof_message, hashlib.sha256).digest()
    if not secrets.compare_digest(expected_issuance_proof, issuance_proof):
        raise HTTPException(401, "TIN V1 lookup issuance proof is invalid")

    canonical_owner_message = node._canonical_tin_owner_intent_message(intent_hash_bytes)
    supplied_owner_message = str(node._field(payload, "owner_intent_message", "ownerIntentMessage", default="") or "")
    if supplied_owner_message and supplied_owner_message.encode("utf-8") != canonical_owner_message:
        raise HTTPException(422, "ownerIntentMessage must be the canonical TIN owner approval message")
    try:
        VerifyKey(owner_bytes).verify(canonical_owner_message, signature_bytes)
    except BadSignatureError as exc:
        raise HTTPException(401, "owner_signature is invalid for the canonical TIN approval message") from exc

    now_iso = datetime.now(timezone.utc).isoformat()
    base: dict[str, Any] = {
        "intentId": intent_id, "intentType": "tin_creation",
        "ownerPubkey": owner_pubkey, "ownerSignature": owner_signature,
        "ownerIntentHash": owner_intent_hash.lower(), "ownerIntentMessage": canonical_owner_message.decode("utf-8"),
        "ownerSignatureMessageFormat": "readable-v1", "nonce": nonce.lower(), "expiry": expiry,
        "createdAt": now_iso, "updatedAt": now_iso, "status": "pending_verification",
        "verifierCranker": None, "submitterCranker": None, "feeMetadata": None,
        "failureReason": None, "onchainSignatures": [],
        "lookupCommitment": lookup_commitment.lower(), "encryptedIdentityEnvelope": encrypted_identity_envelope,
        "encryptedTinRecovery": encrypted_tin_recovery, "encryptedMasterSeed": encrypted_master_seed,
        "encryptedMetadataHash": encrypted_metadata_hash.lower(),
        "routeVersion": route_version, "routeNonce": route_nonce.lower(),
        "tipRouteVersion": tip_route_version,
        "gpruElgamalKeyVersion": gpru_elgamal_key_version,
        "gpruElgamalPublicKey": gpru_elgamal_public_key.hex(),
        "gpruElgamalKeyCommitment": gpru_elgamal_key_commitment.hex(),
        "gpruBalanceScanKeyVersion": gpru_balance_scan_key_version,
        "gpruBalanceScanPublicKeyX": gpru_balance_scan_public_key_x.hex(),
        "gpruBalanceScanPublicKeyY": gpru_balance_scan_public_key_y.hex(),
        "policyCommitment": policy_commitment.hex(),
        "displayNameStatus": "opaque_to_node", "displayNameReadableByNode": False,
        "envelopeChecks": {
            "ownerAuthorization": {"intentHashVerified": True, "signatureVerified": True},
            "encryptedIdentityEnvelope": {"present": True, "base64Decoded": True, "includedInOwnerIntentHash": True, "ciphertextOpenedByNode": False},
            "encryptedTinRecovery": {"present": True, "base64Decoded": True, "includedInOwnerIntentHash": True, "ciphertextOpenedByNode": False},
            "encryptedMasterSeed": {"present": True, "base64Decoded": True, "includedInOwnerIntentHash": True, "ciphertextOpenedByNode": False},
            "gpruElgamalPublicKey": {"present": True, "includedInOwnerIntentHash": True},
            "gpruElgamalKeyCommitment": {"present": True, "includedInOwnerIntentHash": True},
        },
    }
    return base
