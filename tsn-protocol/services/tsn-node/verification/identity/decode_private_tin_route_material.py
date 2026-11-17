"""decode_private_tin_route_material: extracted component.

Inputs and outputs retain the annotations and validation below. Dependencies are
explicit structural ports; raised errors retain the original contract.
"""
from __future__ import annotations
from typing import Any
from functools import partial
from .take_private_tin_bytes import take_private_tin_bytes
from .take_private_tin_u32 import take_private_tin_u32
from typing import Any, Callable, Protocol



def decode_private_tin_route_material(data: bytes) -> dict[str, Any]:
    buffer = bytes(data)
    cursor = [0]
    take = partial(take_private_tin_bytes, buffer, cursor)
    take_u32 = partial(take_private_tin_u32, take)

    version = take(1, "version")[0]
    bump = take(1, "bump")[0]
    status = take(1, "status")[0]
    take(5, "reserved")
    lookup_commitment = take(32, "lookup commitment")
    owner_commitment = take(32, "owner commitment")
    identity_len = take_u32("identity envelope length")
    identity_envelope = take(identity_len, "identity envelope")
    seed_len = take_u32("seed envelope length")
    take(seed_len, "seed envelope")
    take(8, "created at")
    take(32, "metadata hash")
    route_version = int.from_bytes(take(8, "route version"), "little")
    route_nonce = take(32, "route nonce")
    tip_route_version = take(1, "TIP route version")[0]
    gpru_elgamal_key_version = take(1, "GPRU ElGamal key version")[0]
    gpru_elgamal_public_key = take(32, "GPRU ElGamal public key")
    gpru_elgamal_key_commitment = take(32, "GPRU ElGamal key commitment")
    gpru_balance_scan_key_version = take(1, "GPRU balance scan key version")[0]
    gpru_balance_scan_public_key_x = take(32, "GPRU balance scan public key x")
    gpru_balance_scan_public_key_y = take(32, "GPRU balance scan public key y")
    policy_commitment = take(32, "policy commitment")
    if version != 1 or status != 1 or any(buffer[cursor[0]:]):
        raise ValueError("unsupported private TIN account schema")
    if lookup_commitment == bytes(32) or route_version < 1:
        raise ValueError("private TIN account commitments are incomplete")
    return {
        "lookupCommitment": lookup_commitment.hex(),
        "ownerPubkeyHash": owner_commitment.hex(),
        "identityEnvelope": identity_envelope,
        "routeVersion": route_version,
        "routeNonce": route_nonce.hex(),
        "tipRouteVersion": tip_route_version,
        "gpruElgamalKeyVersion": gpru_elgamal_key_version,
        "gpruElgamalPublicKey": gpru_elgamal_public_key.hex(),
        "gpruElgamalKeyCommitment": gpru_elgamal_key_commitment.hex(),
        "gpruBalanceScanKeyVersion": gpru_balance_scan_key_version,
        "gpruBalanceScanPublicKeyX": gpru_balance_scan_public_key_x.hex(),
        "gpruBalanceScanPublicKeyY": gpru_balance_scan_public_key_y.hex(),
        "policyCommitment": policy_commitment.hex(),
    }
