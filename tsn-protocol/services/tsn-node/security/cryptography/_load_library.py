"""_load_library implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from security.cryptography._library_path import _library_path
import ctypes
from functools import lru_cache

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
