from fastapi import HTTPException
import base64
from server import runtime as server

def test_signature_substitution_fails(self):
    self.work['verification']['nodeAttestation']['signatureBase64'] = base64.b64encode(bytes(64)).decode()
    with self.assertRaisesRegex(HTTPException, 'signature is invalid'):
        server._assert_stored_settlement_attestation(self.work, self.transition)
