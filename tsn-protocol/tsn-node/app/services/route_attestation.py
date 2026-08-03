from __future__ import annotations

import base64
from dataclasses import dataclass

from nacl.signing import SigningKey, VerifyKey


@dataclass(frozen=True)
class OpaqueRouteAuthorization:
    message: str
    signature_base64: str
    signer_public_key_base64: str


def canonical_route_message(*, work_id: str, destination: str, route_commitment: str,
                            mint: str, amount: str, expiry: str, program_id: str) -> str:
    values = (work_id, destination, route_commitment, mint, amount, expiry, program_id)
    if any(not value or "\n" in value or "=" in value for value in values):
        raise ValueError("route authorization fields must be non-empty canonical strings")
    return "\n".join([
        "TSN_ROUTE_AUTHORIZATION", "version=1", f"workId={work_id}",
        f"destination={destination}", f"routeCommitment={route_commitment}",
        f"mint={mint}", f"amount={amount}", f"expiry={expiry}",
        f"programId={program_id}",
    ])


def sign_route_message(message: str, signing_key: SigningKey) -> OpaqueRouteAuthorization:
    return OpaqueRouteAuthorization(
        message=message,
        signature_base64=base64.b64encode(signing_key.sign(message.encode()).signature).decode(),
        signer_public_key_base64=base64.b64encode(bytes(signing_key.verify_key)).decode(),
    )


def verify_route_message(authorization: OpaqueRouteAuthorization) -> None:
    VerifyKey(base64.b64decode(authorization.signer_public_key_base64, validate=True)).verify(
        authorization.message.encode(),
        base64.b64decode(authorization.signature_base64, validate=True),
    )
