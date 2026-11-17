from __future__ import annotations

from pathlib import Path
import os

def __init__(self, root: str | os.PathLike[str]) -> None:
    self.root = Path(root).resolve()
    self.root.mkdir(parents=True, exist_ok=True)
