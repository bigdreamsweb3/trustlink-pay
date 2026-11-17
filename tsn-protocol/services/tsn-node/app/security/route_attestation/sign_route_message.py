from __future__ import annotations

from nacl.signing import SigningKey
import base64

def sign_route_message(message: str, signing_key: SigningKey) -> OpaqueRouteAuthorization:
    from .types import OpaqueRouteAuthorization
    return OpaqueRouteAuthorization(
        message=message,
        signature_base64=base64.b64encode(signing_key.sign(message.encode()).signature).decode(),
        signer_public_key_base64=base64.b64encode(bytes(signing_key.verify_key)).decode(),
    )
