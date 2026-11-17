from hidden_head_prover import validate_prover_result

def test_prover_cannot_return_private_witness_fields(self):
    with self.assertRaisesRegex(ValueError, 'unsupported field set'):
        validate_prover_result({**self.result, 'balanceBlindingDelta': 'secret'}, self.witness, self.verifier, 255)
