from __future__ import annotations

from typing import Iterable
from .constants import MAX_SEEDS
from .constants import MAX_SEED_LENGTH
from .constants import PDA_MARKER
from ._as_program_id import _as_program_id
from ._is_ed25519_curve_point import _is_ed25519_curve_point
import hashlib

def create_program_address(
    cls,
    seeds: Iterable[bytes],
    program_id: "Pubkey | bytes",
) -> "Pubkey":
    seed_list = [bytes(seed) for seed in seeds]
    if len(seed_list) > MAX_SEEDS:
        raise ValueError("maximum number of PDA seeds exceeded")
    if any(len(seed) > MAX_SEED_LENGTH for seed in seed_list):
        raise ValueError("maximum PDA seed length exceeded")

    digest = hashlib.sha256(
        b"".join(seed_list) + _as_program_id(program_id) + PDA_MARKER
    ).digest()
    if _is_ed25519_curve_point(digest):
        raise ValueError("PDA lies on the ed25519 curve")
    return cls(digest)
