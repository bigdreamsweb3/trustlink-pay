import copy
from server import runtime as server

def test_full_credit_validation_binds_funding_root_to_authorization_digest(self):
    transition = copy.deepcopy(self.transition)
    transition['proof']['publicInputs'][12] = '04' * 32
    with self.assertRaisesRegex(ValueError, 'authorization digest'):
        server._validate_tcap_credit_digest(transition)
