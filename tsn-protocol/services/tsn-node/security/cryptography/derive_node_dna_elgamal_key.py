"""derive_node_dna_elgamal_key implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from security.cryptography._load_library import _load_library
import ctypes
import hashlib
import secrets

def derive_node_dna_elgamal_key(
    scan_public_key: bytes,
    dna: bytes | None = None,
) -> dict[str, bytes | int]:
    """Create a fresh DNA and recipient ElGamal key without recipient secrets."""
    if len(scan_public_key) != 32 or not any(scan_public_key):
        raise ValueError("GPRU scan public key must be a nonzero 32-byte Ristretto point")
    transaction_dna = secrets.token_bytes(32) if dna is None else bytes(dna)
    if len(transaction_dna) != 32 or not any(transaction_dna):
        raise ValueError("GPRU DNA must be a nonzero 32-byte value")

    randomness = secrets.token_bytes(128)
    scan_input = (ctypes.c_ubyte * 32).from_buffer_copy(scan_public_key)
    dna_input = (ctypes.c_ubyte * 32).from_buffer_copy(transaction_dna)
    random_input = (ctypes.c_ubyte * 128).from_buffer_copy(randomness)
    ephemeral_output = (ctypes.c_ubyte * 32)()
    one_time_output = (ctypes.c_ubyte * 32)()
    proof_output = (ctypes.c_ubyte * 128)()

    library = _load_library()
    status = library.tsn_gpru_derive_node_dna_key_v1(
        scan_input, dna_input, random_input, ephemeral_output, one_time_output, proof_output,
    )
    if status == 2:
        raise RuntimeError("GPRU crypto library rejected a missing input pointer")
    if status != 0:
        raise ValueError("GPRU scan key or derivation inputs are invalid; generate fresh DNA and randomness")

    proof_bytes = bytes(proof_output)
    return {
        "version": 1,
        "dna": transaction_dna,
        "ephemeralPublicKey": bytes(ephemeral_output),
        "oneTimePublicKey": bytes(one_time_output),
        "derivationProof": {
            "sharedPoint": proof_bytes[:32],
            "generatorCommitment": proof_bytes[32:64],
            "scanCommitment": proof_bytes[64:96],
            "response": proof_bytes[96:128],
        },
        "keyCommitment": hashlib.sha256(
            b"TSN_GPRU_DNA_ELGAMAL_KEY_COMMITMENT_V1\0"
            + b"\x01"
            + transaction_dna
            + bytes(ephemeral_output)
            + bytes(one_time_output)
        ).digest(),
    }
