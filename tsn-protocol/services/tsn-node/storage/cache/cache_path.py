"""Resolve a bounded job cache filename; remote input never chooses a directory."""
import re
from pathlib import Path


from .dependencies import CacheDependencies

def cache_path(node: CacheDependencies, identifier: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{64}", identifier):
        raise ValueError("NODE_RELAY_ID_INVALID")
    directory = Path(node.LOCAL_NODE_CACHE_DIR)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    return directory / (identifier + ".json")
