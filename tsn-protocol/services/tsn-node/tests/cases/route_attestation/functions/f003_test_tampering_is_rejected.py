from nacl.exceptions import BadSignatureError
from nacl.signing import SigningKey
from app.services.route_attestation import canonical_route_message
from app.services.route_attestation import sign_route_message
from app.services.route_attestation import verify_route_message

def test_tampering_is_rejected(self):
    authorization = sign_route_message(canonical_route_message(work_id='work-1', route_commitment='ab' * 32, mint='Mint111', amount='1.25', expiry='2030-01-01T00:00:00Z', program_id='Program111'), SigningKey.generate())
    tampered = authorization.__class__(message=authorization.message.replace('amount=1.25', 'amount=2.25'), signature_base64=authorization.signature_base64, signer_public_key_base64=authorization.signer_public_key_base64)
    with self.assertRaises(BadSignatureError):
        verify_route_message(tampered)
