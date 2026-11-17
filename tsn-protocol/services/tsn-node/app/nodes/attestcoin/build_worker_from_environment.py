from __future__ import annotations

from pathlib import Path
import os

def build_worker_from_environment(
    tracker: AttestationTracker,
    crosschain_root: Path,
) -> AttestcoinWorker:
    from .types import AttestationTracker, AttestcoinWorker, HttpEvmCranker
    endpoint = os.environ.get("EVM_CRANKER_ATTEST_URL")
    if not endpoint:
        raise RuntimeError("EVM_CRANKER_ATTEST_URL is required for Creditcoin proof submission")
    return AttestcoinWorker(
        tracker=tracker,
        cranker=HttpEvmCranker(endpoint, os.environ.get("EVM_CRANKER_API_KEY")),
        crosschain_root=crosschain_root,
        node_command=os.environ.get(
            "TSN_CROSSCHAIN_RUNNER",
            "npx.cmd" if os.name == "nt" else "npx",
        ),
    )
