from fastapi import HTTPException
from server import runtime as server

def test_memo_body_substitution_breaks_attestation(self):
    with self.assertRaises(HTTPException):
        server._assert_stored_settlement_attestation(self.work, {**self.transition, 'memoBodyPayload': 'altered'})
