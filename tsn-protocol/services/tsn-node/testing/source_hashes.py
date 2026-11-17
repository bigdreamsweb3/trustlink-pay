"""Capture Python-source hashes without reading configuration or private state."""
import hashlib
from pathlib import Path

def source_hashes(root: Path) -> dict[str, str]:
    return {path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in root.rglob("*.py") if "__pycache__" not in path.parts}
