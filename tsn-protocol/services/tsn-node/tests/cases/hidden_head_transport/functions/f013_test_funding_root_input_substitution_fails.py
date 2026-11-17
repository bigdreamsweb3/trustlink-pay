from fastapi import HTTPException
import copy

def test_funding_root_input_substitution_fails(self):
    transition = copy.deepcopy(self.transition)
    transition['proof']['publicInputs'][12] = '04' * 32
    with self.assertRaisesRegex(HTTPException, 'does not exactly match'):
        self.verify(transition=transition)
