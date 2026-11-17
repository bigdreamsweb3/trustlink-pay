from __future__ import annotations

from ._encode_base58 import _encode_base58

def __str__(self) -> str:
    return _encode_base58(self._bytes)
