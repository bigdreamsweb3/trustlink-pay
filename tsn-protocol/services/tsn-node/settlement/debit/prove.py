"""Run the pinned debit prover and match its key to the enabled chain verifier."""
import asyncio
import hashlib
import json
import os
from .contract import CIRCUIT, PUBLIC_FIELDS, PROVER_LOCK


async def prove_debit(witness: dict, verifier: bytes, bump: int, existing_proof: dict | None = None) -> dict:
    required = ("GPRU_TIN_DEBIT_CIRCUIT_BUILD_DIR", "GPRU_TIN_DEBIT_CIRCUIT_WASM_PATH", "GPRU_TIN_DEBIT_PROVING_KEY_PATH", "GPRU_TIN_DEBIT_VERIFICATION_KEY_PATH", "GPRU_TIN_DEBIT_PROVER_METADATA_PATH", "GPRU_TIN_DEBIT_PROVER_METADATA_SHA256")
    if any(not os.environ.get(name) for name in required):
        raise RuntimeError("GPRU_TIN_DEBIT_PROVER_NOT_CONFIGURED")
    payload = existing_proof if existing_proof is not None else witness
    async with PROVER_LOCK:
        process = await asyncio.create_subprocess_exec(os.environ.get("GPRU_NODE_EXECUTABLE", "node"), str(CIRCUIT / "tools/node-prove.mjs"),
            *(["--verify"] if existing_proof is not None else []), stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
        try:
            stdout, _ = await asyncio.wait_for(process.communicate(json.dumps(payload, separators=(",", ":")).encode("ascii")), 300)
        except BaseException:
            if process.returncode is None:
                process.kill()
            await process.wait()
            raise
    if process.returncode or len(stdout) > 20000:
        raise ValueError("GPRU_TIN_DEBIT_LOCAL_PROOF_FAILED")
    result = json.loads(stdout)
    expected = [format(int(value), "064x") for name in PUBLIC_FIELDS for value in (witness[name] if isinstance(witness[name], list) else [witness[name]])]
    circuit = hashlib.sha256(b"TSN_GPRU_HIDDEN_HEAD_TIN_DEBIT_V1\0" + (CIRCUIT / "main.circom").read_bytes() + (CIRCUIT / "primitives.circom").read_bytes()).digest()
    key = bytes.fromhex(result["verifierBytes"])
    key_hash = hashlib.sha256(b"GPRU_TIN_DEBIT_VERIFYING_KEY_V1\0" + key).digest()
    if (result["publicInputs"] != expected or len(key) != 2176 or len(verifier) != 2284
        or verifier[106] != bump or verifier[107] != 1 or verifier[42:74] != circuit
        or result["circuitCommitment"] != circuit.hex() or verifier[74:106] != key_hash
        or result["verifyingKeyCommitment"] != key_hash.hex() or verifier[108:] != key):
        raise ValueError("GPRU_TIN_DEBIT_PROOF_BINDING_MISMATCH")
    for name, length in (("proofA", 128), ("proofB", 256), ("proofC", 128)):
        value = result.get(name)
        if not isinstance(value, str) or len(value) != length or any(c not in "0123456789abcdef" for c in value):
            raise ValueError("GPRU_TIN_DEBIT_PROOF_ENCODING_INVALID")
    return {name: result[name] for name in ("publicInputs", "proofA", "proofB", "proofC")}
