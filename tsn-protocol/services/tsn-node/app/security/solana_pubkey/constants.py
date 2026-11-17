from __future__ import annotations



BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

PDA_MARKER = b"ProgramDerivedAddress"

MAX_SEEDS = 16

MAX_SEED_LENGTH = 32

_ED25519_P = (1 << 255) - 19

_ED25519_D = (-121665 * pow(121666, -1, _ED25519_P)) % _ED25519_P

_ED25519_SQRT_M1 = pow(2, (_ED25519_P - 1) // 4, _ED25519_P)
