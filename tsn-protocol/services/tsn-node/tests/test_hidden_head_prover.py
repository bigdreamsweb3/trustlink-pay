import copy
import hashlib
import unittest
from pathlib import Path

from hidden_head_prover import PUBLIC_SIGNALS, validate_prover_result
from hidden_head_witness import hex_field
from credit_amount import commitment


class HiddenHeadProverBindingTests(unittest.TestCase):
    def setUp(self):
        self.witness = {name: index + 1 for index, name in enumerate(PUBLIC_SIGNALS)}
        self.witness.update(assetId=7, amount=1000, amountBlinding=11, authorizationCommitment=13)
        self.witness["amountCommitment"] = commitment(7,1000,11,self.witness["nullifier"])
        source = Path(__file__).resolve().parents[3] / "programs/gpru/circuits/hidden_head_v1/main.circom"
        circuit = hashlib.sha256(b"TSN_GPRU_HIDDEN_HEAD_CIRCUIT_V1\0" + source.read_bytes() + b"circomlib-poseidon-bn254-v1").digest()
        points = bytes([1]) * 1344
        key = hashlib.sha256(b"TSN_GPRU_GROTH16_VERIFYING_KEY_V1\0" + points).digest()
        self.result = {
            "publicInputs": [hex_field(self.witness[name]) for name in PUBLIC_SIGNALS],
            "proofA": "01" * 64, "proofB": "01" * 128, "proofC": "01" * 64,
            "circuitCommitment": circuit.hex(), "verifyingKeyCommitment": key.hex(), "verifierBytes": points.hex(),
        }
        self.verifier = hashlib.sha256(b"account:GpruHiddenHeadVerifierV2").digest()[:8] + b"\x02\x00" + bytes(32) + circuit + key + b"\x01\xff" + points

    def test_bound_output_keeps_only_proof_and_public_action(self):
        result = validate_prover_result(self.result, self.witness, self.verifier, 255)
        self.assertEqual(set(result), {"publicInputs", "proofA", "proofB", "proofC", "actionKind", "tokenId", "amountCommitment", "authorizationCommitment"})
        self.assertEqual(result["amountCommitment"], hex_field(self.witness["amountCommitment"]))
        self.assertNotIn("amount",result)

    def test_every_altered_public_input_fails(self):
        for index in range(13):
            result = copy.deepcopy(self.result)
            result["publicInputs"][index] = hex_field(999)
            with self.assertRaisesRegex(ValueError, "locally constructed settlement"):
                validate_prover_result(result, self.witness, self.verifier, 255)

    def test_disabled_wrong_version_wrong_key_or_circuit_fails(self):
        for index in (0, 8, 42, 74, 106, 107, 108):
            verifier = bytearray(self.verifier)
            verifier[index] ^= 1
            with self.assertRaises(ValueError):
                validate_prover_result(self.result, self.witness, bytes(verifier), 255)

    def test_prover_cannot_return_private_witness_fields(self):
        with self.assertRaisesRegex(ValueError, "unsupported field set"):
            validate_prover_result({**self.result, "balanceBlindingDelta": "secret"}, self.witness, self.verifier, 255)


if __name__ == "__main__":
    unittest.main()
