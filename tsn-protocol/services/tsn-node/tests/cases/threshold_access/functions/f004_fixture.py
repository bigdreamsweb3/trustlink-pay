from __future__ import annotations
from app.services.threshold_access import ACCESS_DOMAIN
from app.services.threshold_access import DEVICE_PROOF_DOMAIN
from app.services.threshold_access import DEVICE_PROOF_VERSION
from nacl.signing import SigningKey
from cases.threshold_access.functions.f001_b64url import b64url
from cases.threshold_access.functions.f002_canonical import canonical
from datetime import datetime
from app.utils.encoding import encode_base58
import json
from cases.threshold_access.functions.f003_sha256_hex import sha256_hex
from datetime import timedelta

def fixture(now: datetime) -> tuple[dict, SigningKey]:
    owner = SigningKey.generate()
    device = SigningKey.generate()
    encryption_key = bytes(range(32))
    signing_jwk = {'kty': 'OKP', 'crv': 'Ed25519', 'x': b64url(bytes(device.verify_key))}
    encryption_jwk = {'kty': 'OKP', 'crv': 'X25519', 'x': b64url(encryption_key)}
    signing_fingerprint = sha256_hex(canonical(['TSN_DEVICE_SIGNING_KEY_V1', 'OKP', 'Ed25519', signing_jwk['x']]))
    encryption_fingerprint = sha256_hex(canonical(['TSN_OWNER_CONTROLLED_ENCRYPTION_KEY_V1', 'device', 'OKP', 'X25519', encryption_jwk['x']]))
    owner_public_key = encode_base58(bytes(owner.verify_key))
    tin = '1000000008'
    route_version = 2
    pru_hash = '1' * 64
    resource = '2' * 64
    session = f'lit-session:test:device:{signing_fingerprint}:encryption:{encryption_fingerprint}'
    wallet_message = canonical(['TSN_TIN_MASTER_SEED_ACCESS', tin, owner_public_key, str(route_version), pru_hash, resource, session])
    issued_at = now.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    expires_at = (now + timedelta(minutes=5)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    unsigned = {'version': DEVICE_PROOF_VERSION, 'domain': DEVICE_PROOF_DOMAIN, 'operation': 'PROTECT_KEY', 'tin': tin, 'ownerPublicKey': owner_public_key, 'routeVersion': route_version, 'pruConfigurationHash': pru_hash, 'deviceSessionBinding': session, 'deviceId': 'device-test', 'deviceSigningKeyFingerprint': signing_fingerprint, 'deviceSigningPublicKey': signing_jwk, 'deviceEncryptionKeyFingerprint': encryption_fingerprint, 'deviceEncryptionPublicKey': encryption_jwk, 'walletAuthorizationCommitment': sha256_hex(wallet_message), 'resourceCommitment': resource, 'requestNonce': b64url(bytes(range(32, 64))), 'issuedAt': issued_at, 'expiresAt': expires_at}
    device_message = canonical([unsigned['domain'], unsigned['version'], unsigned['operation'], tin, owner_public_key, str(route_version), pru_hash, session, unsigned['deviceId'], signing_fingerprint, json.dumps(signing_jwk, separators=(',', ':')), encryption_fingerprint, json.dumps(encryption_jwk, separators=(',', ':')), unsigned['walletAuthorizationCommitment'], resource, unsigned['requestNonce'], issued_at, expires_at])
    proof = {**unsigned, 'signatureBase64Url': b64url(device.sign(device_message).signature)}
    request = {'domain': ACCESS_DOMAIN, 'operation': 'PROTECT_KEY', 'pkpId': 'test-pkp', 'access': {'tin': tin, 'ownerPublicKey': owner_public_key, 'routeVersion': route_version, 'pruConfigurationHash': pru_hash, 'deviceSessionBinding': session, 'resourceCommitment': resource}, 'walletAuthorizationMessageBase64Url': b64url(wallet_message), 'walletAuthorizationSignatureBase64Url': b64url(owner.sign(wallet_message).signature), 'deviceAccessProof': proof}
    return (request, SigningKey.generate())
