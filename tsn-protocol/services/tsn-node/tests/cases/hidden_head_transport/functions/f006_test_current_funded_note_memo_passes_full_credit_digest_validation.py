import copy
from server import runtime as server

def test_current_funded_note_memo_passes_full_credit_digest_validation(self):
    self.assertEqual(server._validate_tcap_credit_digest(copy.deepcopy(self.transition)), self.transition['commitmentRoot'])
