import copy
from server import runtime as server

def test_full_credit_validation_rejects_memo_field_substitution(self):
    transition = copy.deepcopy(self.transition)
    transition['proof']['publicInputs'][2] = '04' * 32
    with self.assertRaisesRegex(ValueError, 'canonical Memo hash'):
        server._validate_tcap_credit_digest(transition)
