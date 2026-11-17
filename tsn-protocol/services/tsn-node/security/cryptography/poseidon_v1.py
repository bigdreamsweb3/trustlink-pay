"""poseidon_v1 implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from security.cryptography.gpru_contract import BABYJUB_FIELD
from security.cryptography._load_library import _load_library
import ctypes

def poseidon_v1(values: list[int]) -> int:
    """Use the same native Poseidon implementation as the on-chain verifier."""
    if len(values) not in (1, 2, 3, 4, 5) or any(type(v) is not int or not 0 <= v < BABYJUB_FIELD for v in values):
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
