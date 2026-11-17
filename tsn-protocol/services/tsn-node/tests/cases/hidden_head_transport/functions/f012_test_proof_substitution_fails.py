from fastapi import HTTPException
import copy

def test_proof_substitution_fails(self):
    transition = copy.deepcopy(self.transition)
    transition['proof']['proofA'] = '04' * 64
    with self.assertRaisesRegex(HTTPException, 'does not exactly match'):
        self.verify(transition=transition)
