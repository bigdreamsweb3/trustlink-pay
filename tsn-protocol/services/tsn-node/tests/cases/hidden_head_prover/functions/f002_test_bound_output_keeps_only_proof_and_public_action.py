from hidden_head_witness import hex_field
from hidden_head_prover import validate_prover_result

def test_bound_output_keeps_only_proof_and_public_action(self):
    result = validate_prover_result(self.result, self.witness, self.verifier, 255)
    self.assertEqual(set(result), {'publicInputs', 'proofA', 'proofB', 'proofC', 'actionKind', 'tokenId', 'amountCommitment', 'authorizationCommitment'})
    self.assertEqual(result['amountCommitment'], hex_field(self.witness['amountCommitment']))
    self.assertNotIn('amount', result)
