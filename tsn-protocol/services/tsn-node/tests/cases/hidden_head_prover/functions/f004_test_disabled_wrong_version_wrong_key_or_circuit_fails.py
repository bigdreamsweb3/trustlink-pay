from hidden_head_prover import validate_prover_result

def test_disabled_wrong_version_wrong_key_or_circuit_fails(self):
    for index in (0, 8, 42, 74, 106, 107, 108):
        verifier = bytearray(self.verifier)
        verifier[index] ^= 1
        with self.assertRaises(ValueError):
            validate_prover_result(self.result, self.witness, bytes(verifier), 255)
