"""Python adapter for GPRU one-time keys and owner-encrypted Memo records."""

from __future__ import annotations

import ctypes
import hashlib
import secrets
from functools import lru_cache
from pathlib import Path

BABYJUB_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617
BABYJUB_SUBORDER = 2736030358979909402780800718157159386076813972158567259200215660948447373041
BABYJUB_A = 168700
BABYJUB_D = 168696
BABYJUB_BASE8 = (
    5299619240641551281634865583518297030282874472190772894086521144482721001553,
    16950150798460657717958625567821834550301663161624707787222815936182638968203,
)


def _babyjub_add(left: tuple[int, int], right: tuple[int, int]) -> tuple[int, int]:
    x1, y1 = left
    x2, y2 = right
    product = x1 * x2 * y1 * y2 % BABYJUB_FIELD
    x = (x1 * y2 + y1 * x2) * pow(1 + BABYJUB_D * product, -1, BABYJUB_FIELD) % BABYJUB_FIELD
    y = (y1 * y2 - BABYJUB_A * x1 * x2) * pow(1 - BABYJUB_D * product, -1, BABYJUB_FIELD) % BABYJUB_FIELD
    return x, y


def _babyjub_mul(point: tuple[int, int], scalar: int) -> tuple[int, int]:
    result = (0, 1)
    base = point
    while scalar:
        if scalar & 1:
            result = _babyjub_add(result, base)
        base = _babyjub_add(base, base)
        scalar >>= 1
    return result


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


def poseidon_v1(values: list[int]) -> int:
    """Use the same native Poseidon implementation as the on-chain verifier."""
    if len(values) not in (1, 2, 3, 5) or any(type(v) is not int or not 0 <= v < BABYJUB_FIELD for v in values):
        raise ValueError("GPRU Poseidon inputs must be canonical BN254 fields")
    library = _load_library()
    if not hasattr(library, "tsn_gpru_poseidon_v1"):
        raise RuntimeError("GPRU native library lacks the hidden-head Poseidon adapter; rebuild the native library")
    function = library.tsn_gpru_poseidon_v1
    pointer = ctypes.POINTER(ctypes.c_ubyte)
    function.argtypes = [pointer, ctypes.c_size_t, pointer]
    function.restype = ctypes.c_int
    encoded = b"".join(v.to_bytes(32, "big") for v in values)
    source = (ctypes.c_ubyte * len(encoded)).from_buffer_copy(encoded)
    output = (ctypes.c_ubyte * 32)()
    if function(source, len(values), output) != 0:
        raise ValueError("GPRU native Poseidon rejected the witness inputs")
    return int.from_bytes(bytes(output), "big")


def _library_path() -> Path:
    crate_dir = Path(__file__).resolve().parents[2] / "programs" / "gpru" / "target" / "node-native"
    if __import__("sys").platform == "win32":
        return crate_dir / "release" / "tsn_gpru_proof_contract.dll"
    if __import__("sys").platform == "darwin":
        return crate_dir / "release" / "libtsn_gpru_proof_contract.dylib"
    return crate_dir / "release" / "libtsn_gpru_proof_contract.so"


@lru_cache(maxsize=1)
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
