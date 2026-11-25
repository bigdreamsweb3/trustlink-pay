"""prove_hidden_head_credit implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from settlement.proving.hidden_head_contract import PROTOCOL_ROOT
import asyncio
import json
import os
from settlement.proving.resource_limits import LOCAL_PROVER_LOCK
from settlement.proving.prover_node_args import prover_node_args
from settlement.proving.validate_prover_result import validate_prover_result

async def prove_hidden_head_credit(witness: dict[str, Any], verifier_data: bytes, verifier_bump: int,
                                 *, existing_proof: dict[str, Any] | None = None) -> dict[str, Any]:
    required = ("GPRU_CIRCUIT_BUILD_DIR", "GPRU_CIRCUIT_WASM_PATH", "GPRU_PROVING_KEY_PATH", "GPRU_VERIFICATION_KEY_PATH", "GPRU_PROVER_METADATA_PATH", "GPRU_PROVER_METADATA_SHA256")
    if any(not os.environ.get(name) for name in required):
        raise RuntimeError("GPRU_GROTH16_PROVER_NOT_CONFIGURED: explicit pinned artifacts are required")
    script = PROTOCOL_ROOT / "programs/gpru/circuits/hidden_head_v1/scripts/node-prove.mjs"
    inputs = existing_proof if existing_proof is not None else {k: [str(v) for v in value] if isinstance(value, list) else str(value) for k, value in witness.items()}
    encoded = json.dumps(inputs, separators=(",", ":")).encode("ascii")
    async with LOCAL_PROVER_LOCK:
        process = await asyncio.create_subprocess_exec(
            *prover_node_args(), str(script), *( ["--verify"] if existing_proof is not None else [] ),
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            stdout, _ = await asyncio.wait_for(process.communicate(encoded), timeout=300)
        except BaseException:
            if process.returncode is None:
                process.kill()
            await process.wait()
            raise
    if process.returncode != 0 or len(stdout) > 16 * 1024:
        raise ValueError("GPRU local proof generation or verification failed")
    try:
        result = json.loads(stdout)
    except (UnicodeDecodeError, ValueError) as exc:
        raise ValueError("GPRU local prover did not return a verified proof") from exc
    return validate_prover_result(result, witness, verifier_data, verifier_bump)
