"""Pinned, locally verified aggregate proving. Openings never enter argv or logs."""
from __future__ import annotations
import asyncio, base64, hashlib, json, os
from pathlib import Path
from app.solana_pubkey import Pubkey
from funding_snapshot_sync import TCAP_PROGRAM
from hidden_head_witness import hex_field

GPRU = "6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR"
INPUTS = ("seed", "digest", "total", "count", "tokenId")
_lock = asyncio.Lock()

async def prove_epoch(witness: dict, rpc, existing_proof: dict | None = None) -> dict:
    names = ("GPRU_EPOCH_CIRCUIT_BUILD_DIR", "GPRU_EPOCH_CIRCUIT_WASM_PATH", "GPRU_EPOCH_PROVING_KEY_PATH", "GPRU_EPOCH_VERIFICATION_KEY_PATH", "GPRU_EPOCH_PROVER_METADATA_PATH", "GPRU_EPOCH_PROVER_METADATA_SHA256")
    if any(not os.environ.get(n) for n in names): raise RuntimeError("GPRU_EPOCH_PROVER_NOT_CONFIGURED")
    address, bump = Pubkey.find_program_address([b"gpru:tcap-epoch-verifier:v1"],Pubkey.from_string(GPRU))
    response = await rpc("getAccountInfo",[str(address),{"encoding":"base64","commitment":"confirmed"}])
    account = (response.get("result") or {}).get("value")
    if not isinstance(account,dict) or account.get("owner") != GPRU: raise ValueError("GPRU_EPOCH_VERIFIER_UNAVAILABLE")
    data = base64.b64decode(account["data"][0],validate=True)
    if (len(data) != 940 or data[:8] != hashlib.sha256(b"account:GpruTcapEpochVerifierV1").digest()[:8]
        or data[8:10] != b"\x01\x00" or data[106] != 1 or data[107] != bump): raise ValueError("GPRU_EPOCH_VERIFIER_UNAVAILABLE")
    script = Path(__file__).resolve().parents[2]/"programs/gpru/circuits/tcap_epoch_v1/scripts/node-prove.mjs"
    payload = existing_proof if existing_proof is not None else {k: [str(v) for v in x] if isinstance(x,list) else str(x) for k,x in witness.items()}
    async with _lock:
        proc = await asyncio.create_subprocess_exec(os.environ.get("GPRU_NODE_EXECUTABLE","node"),str(script),*(["--verify"] if existing_proof else []),stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
        try: stdout,_ = await asyncio.wait_for(proc.communicate(json.dumps(payload,separators=(",",":")).encode("ascii")),300)
        except BaseException:
            if proc.returncode is None: proc.kill()
            await proc.wait();raise
    if proc.returncode != 0 or len(stdout) > 16000: raise ValueError("GPRU_EPOCH_LOCAL_PROOF_FAILED")
    result = json.loads(stdout)
    expected = [hex_field(witness[k]) for k in INPUTS]
    source = script.parent.parent/"main.circom"
    circuit = hashlib.sha256(b"TSN_TCAP_CREDIT_EPOCH_CIRCUIT_V1\0"+source.read_bytes()+b"circomlib-poseidon-bn254-v1").digest()
    key = bytes.fromhex(result["verifierBytes"])
    key_hash = hashlib.sha256(b"TSN_TCAP_CREDIT_EPOCH_KEY_V1\0"+key).digest()
    if (result["publicInputs"] != expected or data[42:74] != circuit or result["circuitCommitment"] != circuit.hex()
        or data[74:106] != key_hash or result["verifyingKeyCommitment"] != key_hash.hex() or data[108:] != key):
        raise ValueError("GPRU_EPOCH_PROOF_BINDING_MISMATCH")
    return {k:result[k] for k in ("publicInputs","proofA","proofB","proofC")}
