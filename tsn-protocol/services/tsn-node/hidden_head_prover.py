"""Local-only Groth16 invocation and binding to GPRU's on-chain verifier."""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any

from hidden_head_witness import hex_field

PUBLIC_SIGNALS = (
    "oldGlobalRoot", "newGlobalRoot", "memoCommitment", "actionCommitment", "nullifier", "tipRouteRoot",
    "successorPortfolioRoot", "successorBalanceX", "successorBalanceY", "encryptedBlindingDelta",
    "deltaEphemeralPublicX", "deltaEphemeralPublicY", "fundingRoot",
)
_prover_lock = asyncio.Lock()


def validate_prover_result(result: Any, witness: dict[str, Any], verifier_data: bytes, verifier_bump: int) -> dict[str, Any]:
    allowed = {"publicInputs", "proofA", "proofB", "proofC", "circuitCommitment", "verifyingKeyCommitment", "verifierBytes"}
    if not isinstance(result, dict) or set(result) != allowed:
        raise ValueError("GPRU prover output has an unsupported field set")
    if result["publicInputs"] != [hex_field(witness[name]) for name in PUBLIC_SIGNALS]:
        raise ValueError("GPRU proof public inputs differ from the locally constructed settlement")
    for key, length in (("proofA", 128), ("proofB", 256), ("proofC", 128), ("circuitCommitment", 64), ("verifyingKeyCommitment", 64), ("verifierBytes", 2688)):
        if not isinstance(result[key], str) or not re.fullmatch(r"[0-9a-f]{" + str(length) + "}", result[key]):
            raise ValueError("GPRU prover output encoding is invalid")
    # Account: discriminator, version, authority, circuit, key commitment,
    # enabled, bump, then alpha/beta/gamma/delta and fourteen IC points.
    if (len(verifier_data) != 1452 or verifier_data[:8] != hashlib.sha256(b"account:GpruHiddenHeadVerifierV2").digest()[:8]
            or int.from_bytes(verifier_data[8:10], "little") != 2 or verifier_data[106] != 1 or verifier_data[107] != verifier_bump):
        raise ValueError("GPRU on-chain hidden-head verifier is unavailable or malformed")
    source = Path(__file__).resolve().parents[2] / "programs/gpru/circuits/hidden_head_v1/main.circom"
    circuit = hashlib.sha256(b"TSN_GPRU_HIDDEN_HEAD_CIRCUIT_V1\0" + source.read_bytes() + b"circomlib-poseidon-bn254-v1").digest()
    key_bytes = bytes.fromhex(result["verifierBytes"])
    key_digest = hashlib.sha256(b"TSN_GPRU_GROTH16_VERIFYING_KEY_V1\0" + key_bytes).digest()
    if (bytes.fromhex(result["circuitCommitment"]) != circuit or verifier_data[42:74] != circuit
            or bytes.fromhex(result["verifyingKeyCommitment"]) != key_digest or verifier_data[74:106] != key_digest
            or verifier_data[108:] != key_bytes):
        raise ValueError("GPRU local proving artifacts do not match the on-chain verifier")
    return {key: result[key] for key in ("publicInputs", "proofA", "proofB", "proofC")} | {
        "actionKind": 1, "tokenId": witness["assetId"], "amountCommitment": hex_field(witness["amountCommitment"]),
        "authorizationCommitment": hex_field(witness["authorizationCommitment"]),
    }


async def prove_hidden_head_credit(witness: dict[str, Any], verifier_data: bytes, verifier_bump: int,
                                 *, existing_proof: dict[str, Any] | None = None) -> dict[str, Any]:
    required = ("GPRU_CIRCUIT_BUILD_DIR", "GPRU_CIRCUIT_WASM_PATH", "GPRU_PROVING_KEY_PATH", "GPRU_VERIFICATION_KEY_PATH", "GPRU_PROVER_METADATA_PATH", "GPRU_PROVER_METADATA_SHA256")
    if any(not os.environ.get(name) for name in required):
        raise RuntimeError("GPRU_GROTH16_PROVER_NOT_CONFIGURED: explicit pinned artifacts are required")
    script = Path(__file__).resolve().parents[2] / "programs/gpru/circuits/hidden_head_v1/scripts/node-prove.mjs"
    inputs = existing_proof if existing_proof is not None else {k: [str(v) for v in value] if isinstance(value, list) else str(value) for k, value in witness.items()}
    encoded = json.dumps(inputs, separators=(",", ":")).encode("ascii")
    async with _prover_lock:
        process = await asyncio.create_subprocess_exec(
            os.environ.get("GPRU_NODE_EXECUTABLE", "node"), str(script), *( ["--verify"] if existing_proof is not None else [] ),
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
