"""decode_registry implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from security.cryptography.gpru_contract import BABYJUB_FIELD
from app.solana_pubkey import Pubkey
from settlement.tip.tip_contract import TIP
from settlement.witness._point import _point
import hashlib
from security.cryptography.poseidon_v1 import poseidon_v1
from settlement.tip.registry_take import registry_take

def decode_registry(address: str, data: bytes, tip_program: Pubkey = TIP) -> int:
    offset = [0]
    version, bump, status = registry_take(data, offset, 3)
    registry_take(data, offset, 5)
    lookup = registry_take(data, offset, 32)
    registry_take(data, offset, 32)  # Owner commitment is not part of the route leaf.
    for _ in range(2):
        length = int.from_bytes(registry_take(data, offset, 4), "little")
        # Skip encrypted envelopes without decoding or returning them.
        if offset[0] + length > len(data):
            raise ValueError("TIP registry envelope is truncated")
        offset[0] += length
    registry_take(data, offset, 8 + 32)
    route_version = int.from_bytes(registry_take(data, offset, 8), "little")
    registry_take(data, offset, 32)
    tip_version, key_version = registry_take(data, offset, 2)
    public_key, key = registry_take(data, offset, 32), registry_take(data, offset, 32)
    scan_version = registry_take(data, offset, 1)[0]
    x, y, policy = registry_take(data, offset, 32), registry_take(data, offset, 32), registry_take(data, offset, 32)
    expected_address, expected_bump = Pubkey.find_program_address([b"tin-v1", lookup], tip_program)
    if (version != 1 or status != 1 or route_version < 1 or tip_version != 1
            or key_version != 1 or scan_version != 1 or bump != expected_bump
            or str(expected_address) != address or any(data[offset[0]:])
            or any(value == bytes(32) for value in (lookup, public_key, key, x, y, policy))):
        raise ValueError("TIP registry is not an active canonical V1 route")
    if hashlib.sha256(b"TSN_GPRU_ELGAMAL_KEY_COMMITMENT_V1\0" + bytes([key_version]) + public_key).digest() != key:
        raise ValueError("TIP registry ElGamal commitment is invalid")
    _point({"x": str(int.from_bytes(x, "big")), "y": str(int.from_bytes(y, "big"))})
    return poseidon_v1([int.from_bytes(value, "big") % BABYJUB_FIELD for value in (lookup, key, x, y, policy)])
