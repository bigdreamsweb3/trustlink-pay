import unittest

from nacl.signing import SigningKey
from nacl.exceptions import BadSignatureError

from app.services.route_attestation import (
    canonical_route_amount, canonical_route_message, sign_route_message,
    verify_route_message,
)


class RouteAttestationTests(unittest.TestCase):
    def test_amount_uses_json_compatible_spelling(self):
        self.assertEqual(canonical_route_amount(1.0), "1")
        self.assertEqual(canonical_route_amount(10.0), "10")
        self.assertEqual(canonical_route_amount("1.2300"), "1.23")
        self.assertEqual(canonical_route_amount("1e-7"), "0.0000001")

    def test_attestation_exposes_no_recipient_or_route_map(self):
        message = canonical_route_message(
            work_id="work-1", route_commitment="ab" * 32,
            mint="Mint111", amount="1.25", expiry="2030-01-01T00:00:00Z",
            program_id="Program111",
        )
        authorization = sign_route_message(message, SigningKey.generate())
        verify_route_message(authorization)
        self.assertNotIn("TIN", authorization.message)
        self.assertNotIn("prus", authorization.message.lower())
        self.assertNotIn("destination", authorization.message.lower())

    def test_tampering_is_rejected(self):
        authorization = sign_route_message(
            canonical_route_message(
                work_id="work-1", route_commitment="ab" * 32,
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
