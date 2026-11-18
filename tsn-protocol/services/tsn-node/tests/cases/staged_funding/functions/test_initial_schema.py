from core.schemas.create_intent_request import CreateIntentRequest


def test_initial_schema(self):
    initial = {k: v for k, v in self.payload.items() if k not in ('senderSignedFundingTransaction', 'senderFundingBlockhashContext')}
    self.assertEqual(CreateIntentRequest(**initial).paymentId, self.work['id'])
    with self.assertRaises(ValueError):
        CreateIntentRequest(**self.payload)
