import copy
from hidden_head_witness import hex_field
from hidden_head_prover import validate_prover_result

def test_every_altered_public_input_fails(self):
    for index in range(13):
        result = copy.deepcopy(self.result)
        result['publicInputs'][index] = hex_field(999)
        with self.assertRaisesRegex(ValueError, 'locally constructed settlement'):
            validate_prover_result(result, self.witness, self.verifier, 255)
