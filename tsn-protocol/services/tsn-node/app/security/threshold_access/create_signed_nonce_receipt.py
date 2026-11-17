from __future__ import annotations

from .constants import NONCE_RECEIPT_DOMAIN
from nacl.signing import SigningKey
from ._base64url_encode import _base64url_encode
from ._canonical_fields import _canonical_fields
from datetime import datetime
from datetime import timezone

def create_signed_nonce_receipt(
    verified: dict[str, str],
    *,
    consumed_at: datetime,
    signing_key: SigningKey,
) -> dict[str, str]:
    receipt = {
        "domain": NONCE_RECEIPT_DOMAIN,
        "operation": verified["operation"],
        "tin": verified["tin"],
        "ownerPublicKey": verified["ownerPublicKey"],
        "resourceCommitment": verified["resourceCommitment"],
        "requestNonce": verified["requestNonce"],
        "consumedAt": consumed_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "expiresAt": verified["expiresAt"],
        "verifierPublicKeyBase64Url": _base64url_encode(bytes(signing_key.verify_key)),
    }
    message = _canonical_fields([str(receipt[field]) for field in (
        "domain",
        "operation",
        "tin",
        "ownerPublicKey",
        "resourceCommitment",
        "requestNonce",
        "consumedAt",
        "expiresAt",
        "verifierPublicKeyBase64Url",
    )])
    return {
        **receipt,
        "signatureBase64Url": _base64url_encode(signing_key.sign(message).signature),
    }
