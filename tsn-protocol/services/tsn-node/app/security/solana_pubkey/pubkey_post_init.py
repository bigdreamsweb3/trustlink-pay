from __future__ import annotations



def __post_init__(self) -> None:
    if len(self._bytes) != 32:
        raise ValueError("public key must contain 32 bytes")
    object.__setattr__(self, "_bytes", bytes(self._bytes))
