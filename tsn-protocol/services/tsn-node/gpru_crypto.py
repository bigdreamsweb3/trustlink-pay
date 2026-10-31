"""Python adapter for GPRU one-time keys and owner-encrypted Memo records."""

from __future__ import annotations

import ctypes
import hashlib
import secrets
from pathlib import Path


def _library_path() -> Path:
    crate_dir = Path(__file__).resolve().parents[2] / "programs" / "gpru" / "target" / "node-native"
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
            "for the Node runtime with cargo build --release --target-dir target/node-native"
        )
    library = ctypes.CDLL(str(library_path))
    required_symbols = (
        "tsn_gpru_derive_node_dna_key_v1",
        "tsn_gpru_derive_record_shared_point_v1",
    )
    missing_symbols = [name for name in required_symbols if not hasattr(library, name)]
    if missing_symbols:
        raise RuntimeError(
            "GPRU Node native library is stale or incompatible; missing exports: "
            + ", ".join(missing_symbols)
            + ". Rebuild with cargo build --release --target-dir target/node-native."
        )
    function = library.tsn_gpru_derive_node_dna_key_v1
    byte_pointer = ctypes.POINTER(ctypes.c_ubyte)
    function.argtypes = [byte_pointer, byte_pointer, byte_pointer, byte_pointer, byte_pointer, byte_pointer]
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


def derive_node_record_shared_point(scan_public_key: bytes) -> tuple[bytes, bytes]:
    """Return a fresh ephemeral key and private shared point for an owner-only Memo record."""
    if len(scan_public_key) != 32 or not any(scan_public_key):
        raise ValueError("GPRU scan public key must be a nonzero 32-byte Ristretto point")
    scan_input = (ctypes.c_ubyte * 32).from_buffer_copy(scan_public_key)
    random_input = (ctypes.c_ubyte * 64).from_buffer_copy(secrets.token_bytes(64))
    ephemeral_output = (ctypes.c_ubyte * 32)()
    shared_output = (ctypes.c_ubyte * 32)()
    library = _load_library()
    function = library.tsn_gpru_derive_record_shared_point_v1
    byte_pointer = ctypes.POINTER(ctypes.c_ubyte)
    function.argtypes = [byte_pointer, byte_pointer, byte_pointer, byte_pointer]
    function.restype = ctypes.c_int
    status = function(scan_input, random_input, ephemeral_output, shared_output)
    if status == 2:
        raise RuntimeError("GPRU crypto library rejected a missing record key input")
    if status != 0:
        raise ValueError("GPRU record key agreement failed for the registered scan public key")
    return bytes(ephemeral_output), bytes(shared_output)
