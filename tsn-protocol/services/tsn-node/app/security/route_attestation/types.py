from __future__ import annotations

from dataclasses import dataclass

@dataclass(frozen=True)
class OpaqueRouteAuthorization:
    message: str
    signature_base64: str
    signer_public_key_base64: str
