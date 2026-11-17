from __future__ import annotations

from nacl.signing import VerifyKey
import base64

def verify_route_message(authorization: OpaqueRouteAuthorization) -> None:
    from .types import OpaqueRouteAuthorization
    VerifyKey(base64.b64decode(authorization.signer_public_key_base64, validate=True)).verify(
        authorization.message.encode(),
        base64.b64decode(authorization.signature_base64, validate=True),
    )
