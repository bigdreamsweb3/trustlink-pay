"""encrypt_balance_blinding_delta_v1 implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from security.cryptography.gpru_contract import BABYJUB_A
from security.cryptography.gpru_contract import BABYJUB_BASE8
from security.cryptography.gpru_contract import BABYJUB_D
from security.cryptography.gpru_contract import BABYJUB_FIELD
from security.cryptography.gpru_contract import BABYJUB_SUBORDER
from security.cryptography._babyjub_mul import _babyjub_mul
import secrets

def encrypt_balance_blinding_delta_v1(
    *, scan_public_key_x: bytes, scan_public_key_y: bytes, blinding_delta: int,
) -> dict[str, int]:
    """Create the circuit-bound one-time BabyJubjub ciphertext C=delta+x(e*S) mod q."""
    if len(scan_public_key_x) != 32 or len(scan_public_key_y) != 32:
        raise ValueError("GPRU balance scan coordinates must be 32 bytes each")
    scan_public = (int.from_bytes(scan_public_key_x, "big"), int.from_bytes(scan_public_key_y, "big"))
    x, y = scan_public
    if x >= BABYJUB_FIELD or y >= BABYJUB_FIELD or (BABYJUB_A * x * x + y * y - 1 - BABYJUB_D * x * x * y * y) % BABYJUB_FIELD:
        raise ValueError("TIP GPRU balance scan key is not a canonical BabyJubjub point")
    if _babyjub_mul(scan_public, BABYJUB_SUBORDER) != (0, 1):
        raise ValueError("TIP GPRU balance scan key is outside the prime-order subgroup")
    if scan_public == (0, 1):
        raise ValueError("TIP GPRU balance scan key cannot be the identity")
    if not 0 < blinding_delta < BABYJUB_SUBORDER:
        raise ValueError("GPRU balance blinding delta must be a nonzero BabyJubjub scalar")
    ephemeral_scalar = secrets.randbelow(BABYJUB_SUBORDER - 1) + 1
    ephemeral_public = _babyjub_mul(BABYJUB_BASE8, ephemeral_scalar)
    shared = _babyjub_mul(scan_public, ephemeral_scalar)
    return {
        "ephemeralScalar": ephemeral_scalar,
        "ephemeralPublicX": ephemeral_public[0],
        "ephemeralPublicY": ephemeral_public[1],
        "encryptedDelta": (blinding_delta + shared[0]) % BABYJUB_SUBORDER,
        "sharedXReduction": shared[0] % BABYJUB_SUBORDER,
        "sharedXCarry": shared[0] // BABYJUB_SUBORDER,
        "encryptedDeltaCarry": (blinding_delta + shared[0] % BABYJUB_SUBORDER) // BABYJUB_SUBORDER,
    }
