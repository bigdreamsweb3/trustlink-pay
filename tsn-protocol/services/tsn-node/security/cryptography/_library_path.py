"""_library_path implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from security.cryptography.gpru_contract import PROTOCOL_ROOT
from pathlib import Path
import os
import sys

def _library_path() -> Path:
    configured = os.environ.get("GPRU_NATIVE_LIBRARY_PATH", "").strip()
    if configured:
        library_path = Path(configured)
        if not library_path.is_absolute():
            raise ValueError("GPRU_NATIVE_LIBRARY_PATH must be an absolute native-library path")
        return library_path
    crate_dir = PROTOCOL_ROOT / "programs" / "gpru" / "target" / "node-native"
    if sys.platform == "win32":
        return crate_dir / "release" / "tsn_gpru_proof_contract.dll"
    if sys.platform == "darwin":
        return crate_dir / "release" / "libtsn_gpru_proof_contract.dylib"
    return crate_dir / "release" / "libtsn_gpru_proof_contract.so"
