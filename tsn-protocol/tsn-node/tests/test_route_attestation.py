import unittest

from nacl.signing import SigningKey
from nacl.exceptions import BadSignatureError

from app.services.route_attestation import (
    canonical_route_message, sign_route_message, verify_route_message,
)


class RouteAttestationTests(unittest.TestCase):
    def test_attestation_exposes_no_tin_or_route_map(self):
        message = canonical_route_message(
            work_id="work-1", destination="Destination111", route_commitment="ab" * 32,
            mint="Mint111", amount="1.25", expiry="2030-01-01T00:00:00Z",
            program_id="Program111",
        )
        authorization = sign_route_message(message, SigningKey.generate())
        verify_route_message(authorization)
        self.assertNotIn("TIN", authorization.message)
        self.assertNotIn("prus", authorization.message.lower())

    def test_tampering_is_rejected(self):
        authorization = sign_route_message(
            canonical_route_message(
                work_id="work-1", destination="Destination111", route_commitment="ab" * 32,
                mint="Mint111", amount="1.25", expiry="2030-01-01T00:00:00Z",
                program_id="Program111",
            ), SigningKey.generate(),
        )
        tampered = authorization.__class__(
            message=authorization.message.replace("amount=1.25", "amount=2.25"),
            signature_base64=authorization.signature_base64,
            signer_public_key_base64=authorization.signer_public_key_base64,
        )
        with self.assertRaises(BadSignatureError):
            verify_route_message(tampered)


if __name__ == "__main__":
    unittest.main()
