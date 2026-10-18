"""Python adapter for the standalone GPRU Ristretto crypto core."""

from __future__ import annotations

import ctypes
import hashlib
import secrets
from pathlib import Path


def _library_path() -> Path:
    crate_dir = Path(__file__).resolve().parents[2] / "programs" / "gpru" / "target"
    if __import__("sys").platform == "win32":
        return crate_dir / "release" / "tsn_gpru_proof_contract.dll"
    if __import__("sys").platform == "darwin":
        return crate_dir / "release" / "libtsn_gpru_proof_contract.dylib"
    return crate_dir / "release" / "libtsn_gpru_proof_contract.so"


def _load_library() -> ctypes.CDLL:
    library_path = _library_path()
    if not library_path.is_file():
        raise RuntimeError(
            "GPRU crypto library is not built; build tsn-protocol/programs/gpru "
            "with cargo build --release before using DNA key derivation"
        )
    library = ctypes.CDLL(str(library_path))
    function = library.tsn_gpru_derive_node_dna_key_v1
    byte_pointer = ctypes.POINTER(ctypes.c_ubyte)
    function.argtypes = [byte_pointer, byte_pointer, byte_pointer, byte_pointer, byte_pointer]
    function.restype = ctypes.c_int
    return library


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

    randomness = secrets.token_bytes(64)
    scan_input = (ctypes.c_ubyte * 32).from_buffer_copy(scan_public_key)
    dna_input = (ctypes.c_ubyte * 32).from_buffer_copy(transaction_dna)
    random_input = (ctypes.c_ubyte * 64).from_buffer_copy(randomness)
    ephemeral_output = (ctypes.c_ubyte * 32)()
    one_time_output = (ctypes.c_ubyte * 32)()

    library = _load_library()
    status = library.tsn_gpru_derive_node_dna_key_v1(
        scan_input,
        dna_input,
        random_input,
        ephemeral_output,
        one_time_output,
    )
    if status == 2:
        raise RuntimeError("GPRU crypto library rejected a missing input pointer")
    if status != 0:
        raise ValueError("GPRU scan key or derivation inputs are invalid; generate fresh DNA and randomness")

    return {
        "version": 1,
        "dna": transaction_dna,
        "ephemeralPublicKey": bytes(ephemeral_output),
        "oneTimePublicKey": bytes(one_time_output),
        "keyCommitment": hashlib.sha256(
            b"TSN_GPRU_DNA_ELGAMAL_KEY_COMMITMENT_V1\0"
            + b"\x01"
            + transaction_dna
            + bytes(ephemeral_output)
            + bytes(one_time_output)
        ).digest(),
    }
