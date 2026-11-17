from nacl.signing import SigningKey
from app.services.route_attestation import canonical_route_message
from app.services.route_attestation import sign_route_message
from app.services.route_attestation import verify_route_message

def test_attestation_exposes_no_recipient_or_route_map(self):
    message = canonical_route_message(work_id='work-1', route_commitment='ab' * 32, mint='Mint111', amount='1.25', expiry='2030-01-01T00:00:00Z', program_id='Program111')
    authorization = sign_route_message(message, SigningKey.generate())
    verify_route_message(authorization)
    self.assertNotIn('TIN', authorization.message)
    self.assertNotIn('prus', authorization.message.lower())
    self.assertNotIn('destination', authorization.message.lower())
