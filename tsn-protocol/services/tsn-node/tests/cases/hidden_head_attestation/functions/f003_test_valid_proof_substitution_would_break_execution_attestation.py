from fastapi import HTTPException
import copy
from server import runtime as server

def test_valid_proof_substitution_would_break_execution_attestation(self):
    transition = copy.deepcopy(self.transition)
    transition['proof']['publicInputs'][5] = 'another valid route'
    with self.assertRaisesRegex(HTTPException, 'Node-attested execution payload'):
        server._assert_stored_settlement_attestation(self.work, transition)
