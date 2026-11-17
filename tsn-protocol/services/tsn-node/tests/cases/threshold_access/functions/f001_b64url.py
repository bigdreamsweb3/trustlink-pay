from __future__ import annotations
import base64

def b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode('ascii').rstrip('=')
