from __future__ import annotations

from pathlib import Path

def __init__(
    self,
    tracker: AttestationTracker,
    cranker: EvmCranker,
    crosschain_root: Path,
    node_command: str = "npx",
    max_retries: int = 3,
) -> None:
    from .types import AttestationTracker, EvmCranker
    self.tracker = tracker
    self.cranker = cranker
    self.crosschain_root = crosschain_root
    self.node_command = node_command
    self.max_retries = max_retries
