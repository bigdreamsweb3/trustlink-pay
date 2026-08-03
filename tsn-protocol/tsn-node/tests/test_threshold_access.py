from __future__ import annotations

import base64
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from nacl.signing import SigningKey

from app.services.threshold_access import (
    ACCESS_DOMAIN,
    DEVICE_PROOF_DOMAIN,
    DEVICE_PROOF_VERSION,
    ThresholdAccessError,
    create_signed_nonce_receipt,
    nonce_storage_key,
    threshold_request_commitment,
    verify_threshold_access_request,
)
from app.store import FileStore
from app.utils.encoding import encode_base58


def b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def canonical(fields: list[str]) -> bytes:
    return "|".join(f"{len(field)}:{field}" for field in fields).encode()


def sha256_hex(value: bytes) -> str:
    import hashlib

    return hashlib.sha256(value).hexdigest()


def fixture(now: datetime) -> tuple[dict, SigningKey]:
    owner = SigningKey.generate()
    device = SigningKey.generate()
    encryption_key = bytes(range(32))
    signing_jwk = {
        "kty": "OKP",
        "crv": "Ed25519",
        "x": b64url(bytes(device.verify_key)),
    }
    encryption_jwk = {
        "kty": "OKP",
        "crv": "X25519",
        "x": b64url(encryption_key),
    }
    signing_fingerprint = sha256_hex(canonical([
        "TSN_DEVICE_SIGNING_KEY_V1",
        "OKP",
        "Ed25519",
        signing_jwk["x"],
    ]))
    encryption_fingerprint = sha256_hex(canonical([
        "TSN_OWNER_CONTROLLED_ENCRYPTION_KEY_V1",
        "device",
        "OKP",
        "X25519",
        encryption_jwk["x"],
    ]))
    owner_public_key = encode_base58(bytes(owner.verify_key))
    tin = "1000000008"
    route_version = 2
    pru_hash = "1" * 64
    resource = "2" * 64
    session = (
        f"lit-session:test:device:{signing_fingerprint}"
        f":encryption:{encryption_fingerprint}"
    )
    wallet_message = canonical([
        "TSN_TIN_MASTER_SEED_ACCESS",
        tin,
        owner_public_key,
        str(route_version),
        pru_hash,
        resource,
        session,
    ])
    issued_at = now.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    expires_at = (now + timedelta(minutes=5)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    unsigned = {
        "version": DEVICE_PROOF_VERSION,
        "domain": DEVICE_PROOF_DOMAIN,
        "operation": "PROTECT_KEY",
        "tin": tin,
        "ownerPublicKey": owner_public_key,
        "routeVersion": route_version,
        "pruConfigurationHash": pru_hash,
        "deviceSessionBinding": session,
        "deviceId": "device-test",
        "deviceSigningKeyFingerprint": signing_fingerprint,
        "deviceSigningPublicKey": signing_jwk,
        "deviceEncryptionKeyFingerprint": encryption_fingerprint,
        "deviceEncryptionPublicKey": encryption_jwk,
        "walletAuthorizationCommitment": sha256_hex(wallet_message),
        "resourceCommitment": resource,
        "requestNonce": b64url(bytes(range(32, 64))),
        "issuedAt": issued_at,
        "expiresAt": expires_at,
    }
    device_message = canonical([
        unsigned["domain"],
        unsigned["version"],
        unsigned["operation"],
        tin,
        owner_public_key,
        str(route_version),
        pru_hash,
        session,
        unsigned["deviceId"],
        signing_fingerprint,
        json.dumps(signing_jwk, separators=(",", ":")),
        encryption_fingerprint,
        json.dumps(encryption_jwk, separators=(",", ":")),
        unsigned["walletAuthorizationCommitment"],
        resource,
        unsigned["requestNonce"],
        issued_at,
        expires_at,
    ])
    proof = {
        **unsigned,
        "signatureBase64Url": b64url(device.sign(device_message).signature),
    }
    request = {
        "domain": ACCESS_DOMAIN,
        "operation": "PROTECT_KEY",
        "pkpId": "test-pkp",
        "access": {
            "tin": tin,
            "ownerPublicKey": owner_public_key,
            "routeVersion": route_version,
            "pruConfigurationHash": pru_hash,
            "deviceSessionBinding": session,
            "resourceCommitment": resource,
        },
        "walletAuthorizationMessageBase64Url": b64url(wallet_message),
        "walletAuthorizationSignatureBase64Url": b64url(owner.sign(wallet_message).signature),
        "deviceAccessProof": proof,
    }
    return request, SigningKey.generate()


class ThresholdAccessTests(unittest.IsolatedAsyncioTestCase):
    async def test_exact_wallet_and_device_proof_consumes_once(self) -> None:
        now = datetime.now(timezone.utc)
        request, receipt_key = fixture(now)
        verified = verify_threshold_access_request(request, now=now)
        with tempfile.TemporaryDirectory() as directory:
            store = FileStore(Path(directory) / "store.json")
            key = nonce_storage_key(verified)
            receipt = create_signed_nonce_receipt(
                verified,
                consumed_at=now,
                signing_key=receipt_key,
            )
            self.assertTrue(await store.consume_once("nonces", key, json.dumps(receipt)))
            self.assertFalse(await store.consume_once("nonces", key, json.dumps(receipt)))
            self.assertNotIn("masterSeed", json.dumps(receipt))
            self.assertEqual(
                threshold_request_commitment(request),
                threshold_request_commitment(json.loads(json.dumps(request))),
            )

    async def test_request_commitment_rejects_an_altered_retry(self) -> None:
        now = datetime.now(timezone.utc)
        request, _ = fixture(now)
        original = threshold_request_commitment(request)
        request["pkpId"] = "different-pkp"
        self.assertNotEqual(original, threshold_request_commitment(request))

    async def test_tampered_resource_and_device_signature_are_rejected(self) -> None:
        now = datetime.now(timezone.utc)
        request, _ = fixture(now)
        request["access"]["resourceCommitment"] = "3" * 64
        with self.assertRaisesRegex(ThresholdAccessError, "does not match"):
            verify_threshold_access_request(request, now=now)

        request, _ = fixture(now)
        request["deviceAccessProof"]["signatureBase64Url"] = b64url(bytes(64))
        with self.assertRaisesRegex(ThresholdAccessError, "device signature"):
            verify_threshold_access_request(request, now=now)

    async def test_expired_proof_is_rejected(self) -> None:
        issued = datetime.now(timezone.utc) - timedelta(minutes=10)
        request, _ = fixture(issued)
        with self.assertRaisesRegex(ThresholdAccessError, "expired"):
            verify_threshold_access_request(request)


if __name__ == "__main__":
    unittest.main()
