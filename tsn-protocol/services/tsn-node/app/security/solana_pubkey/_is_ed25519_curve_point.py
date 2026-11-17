from __future__ import annotations

from .constants import _ED25519_D
from .constants import _ED25519_P
from .constants import _ED25519_SQRT_M1

def _is_ed25519_curve_point(data: bytes) -> bool:
    """Match Solana's compressed Edwards-Y decompression check."""
    if len(data) != 32:
        return False

    encoded = int.from_bytes(data, "little")
    sign = encoded >> 255
    y = encoded & ((1 << 255) - 1)
    if y >= _ED25519_P:
        return False

    y_squared = (y * y) % _ED25519_P
    u = (y_squared - 1) % _ED25519_P
    v = (_ED25519_D * y_squared + 1) % _ED25519_P
    uv7 = (u * pow(v, 7, _ED25519_P)) % _ED25519_P
    x = (u * pow(v, 3, _ED25519_P) * pow(uv7, (_ED25519_P - 5) // 8, _ED25519_P)) % _ED25519_P

    # The compact form above computes a candidate square root. Correct it
    # with sqrt(-1) when the first candidate is the other square root.
    x_squared = (x * x) % _ED25519_P
    if (x_squared * v - u) % _ED25519_P != 0:
        x = (x * _ED25519_SQRT_M1) % _ED25519_P
        x_squared = (x * x) % _ED25519_P
    if (x_squared * v - u) % _ED25519_P != 0:
        return False
    return not (x == 0 and sign == 1)
