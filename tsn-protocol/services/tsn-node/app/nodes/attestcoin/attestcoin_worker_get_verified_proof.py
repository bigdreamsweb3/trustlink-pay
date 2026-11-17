from __future__ import annotations

from typing import Any
import asyncio
import json
import os

async def _get_verified_proof(self, job: TinExitAttestationJob) -> dict[str, Any]:
    from .types import TinExitAttestationJob
    env = os.environ.copy()
    env["ANCHOR_TX_HASH"] = job.anchor_tx_hash
    env["SOURCE_CHAIN_KEY"] = "1"
    command = [self.node_command, "tsx", "worker/usc-proof-helper.ts"]
    process = await asyncio.create_subprocess_exec(
        *command,
        cwd=self.crosschain_root,
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    if process.returncode != 0:
        raise RuntimeError(f"USC proof helper failed: {stderr.decode().strip()}")
    try:
        return json.loads(stdout.decode().strip())
    except json.JSONDecodeError as exc:
        raise RuntimeError("USC proof helper returned invalid JSON") from exc
