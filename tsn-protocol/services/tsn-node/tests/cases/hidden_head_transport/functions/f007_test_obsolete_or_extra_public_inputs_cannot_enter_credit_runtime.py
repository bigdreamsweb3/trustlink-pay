import copy
from server import runtime as server

def test_obsolete_or_extra_public_inputs_cannot_enter_credit_runtime(self):
    for count in (8, 9, 12, 14):
        with self.subTest(count=count):
            transition = copy.deepcopy(self.transition)
            transition['proof']['publicInputs'] = (transition['proof']['publicInputs'] + ['01' * 32])[:count]
            with self.assertRaisesRegex(ValueError, 'exactly thirteen public'):
                server._validate_tcap_credit_digest(transition)
