"""validate_prover_result implementation; preserve source inputs, encodings and errors."""
from __future__ import annotations
from typing import Any
from settlement.proving.hidden_head_contract import PROTOCOL_ROOT
from settlement.proving.hidden_head_contract import PUBLIC_SIGNALS
import hashlib
from settlement.witness.hex_field import hex_field
import re

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
    source = PROTOCOL_ROOT / "programs/gpru/circuits/hidden_head_v1/main.circom"
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
