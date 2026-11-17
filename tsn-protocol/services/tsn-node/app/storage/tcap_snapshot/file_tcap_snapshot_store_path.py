from __future__ import annotations

from pathlib import Path
from ._key import _key

def _path(self, commitment: str) -> Path:
    return self.root / f"{_key(commitment)}.json"
