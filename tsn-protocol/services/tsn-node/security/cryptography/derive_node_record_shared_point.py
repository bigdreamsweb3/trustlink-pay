"""derive_node_record_shared_point implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from security.cryptography._load_library import _load_library
import ctypes
import secrets

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
