from __future__ import annotations

from typing import Iterable

def find_program_address(
    cls,
    seeds: Iterable[bytes],
    program_id: "Pubkey | bytes",
) -> tuple["Pubkey", int]:
    seed_list = [bytes(seed) for seed in seeds]
    for bump in range(255, -1, -1):
        try:
            return cls.create_program_address(seed_list + [bytes([bump])], program_id), bump
        except ValueError as exc:
            if str(exc) != "PDA lies on the ed25519 curve":
                raise
    raise ValueError("unable to find a viable program address bump seed")
