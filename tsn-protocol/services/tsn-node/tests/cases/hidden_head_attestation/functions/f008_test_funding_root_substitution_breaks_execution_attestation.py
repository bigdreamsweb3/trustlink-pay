from fastapi import HTTPException
from server import runtime as server

def test_funding_root_substitution_breaks_execution_attestation(self):
    with self.assertRaisesRegex(HTTPException, 'Node-attested execution payload'):
        server._assert_stored_settlement_attestation(self.work, {**self.transition, 'fundingRootAccount': 'another-root'})
