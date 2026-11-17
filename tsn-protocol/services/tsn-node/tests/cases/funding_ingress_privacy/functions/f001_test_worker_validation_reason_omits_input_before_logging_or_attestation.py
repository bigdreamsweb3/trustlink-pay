from pydantic import ValidationError
from server import runtime as server

def test_worker_validation_reason_omits_input_before_logging_or_attestation(self):
    with self.assertRaises(ValidationError) as raised:
        server.CreateIntentRequest(fundingNote={'version': 1, 'secret': '01' * 32, 'blinding': '02' * 32, 'commitment': '03' * 32})
    self.assertEqual(server._verification_rejection_reason(raised.exception), 'Invalid Receiver payment request fields')
    self.assertEqual(server._verification_rejection_reason(ValueError(server.FUNDING_ROOT_CHANGED)), server.FUNDING_ROOT_CHANGED)
