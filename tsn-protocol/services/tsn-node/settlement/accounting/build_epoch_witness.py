"""build_epoch_witness implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from pathlib import Path
from settlement.accounting.private_credit_wait import PrivateCreditWait
from settlement.witness.hex_field import hex_field
from security.cryptography.poseidon_v1 import poseidon_v1
from amounts.credit.read_opening import read_opening
from settlement.accounting.credit_sequence import credit_sequence

def build_epoch_witness(epoch: dict, credits: list[dict], directory: Path) -> dict:
    if not 2 <= epoch["count"] <= 64 or len(credits) != epoch["count"]:
        raise PrivateCreditWait("TCAP_EPOCH_REQUIRES_COMPLETE_GROUP")
    ordered = sorted(credits, key=credit_sequence)
    if len({row["sequence"] for row in ordered}) != len(ordered) or len({row["nullifier"] for row in ordered}) != len(ordered):
        raise ValueError("TCAP_EPOCH_DUPLICATE_TRANSITION")
    amounts, blindings, nullifiers = [], [], []
    digest = int(epoch["seed"], 16)
    for row in ordered:
        opening = read_opening(directory, row["amountCommitment"])
        if (opening["tokenId"] != epoch["token"] or opening["nullifier"] != row["nullifier"]
            or row["epoch"] != epoch["address"]):
            raise ValueError("TCAP_EPOCH_OPENING_BINDING_MISMATCH")
        amounts.append(int(opening["amount"])); blindings.append(int(opening["blinding"])); nullifiers.append(int(row["nullifier"], 16))
        digest = poseidon_v1([digest, int(row["amountCommitment"],16), nullifiers[-1]])
    if hex_field(digest) != epoch["digest"] or sum(amounts) > 0xffffffffffffffff:
        raise ValueError("TCAP_EPOCH_TRANSCRIPT_MISMATCH")
    return {"seed": int(epoch["seed"],16), "digest": digest, "total": sum(amounts), "count": len(ordered), "tokenId": epoch["token"],
            "amounts": amounts + [0]*(64-len(ordered)), "blindings": blindings + [0]*(64-len(ordered)), "nullifiers": nullifiers + [0]*(64-len(ordered))}
