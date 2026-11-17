from cases.wallet_funding_transaction.functions.f002_compute import compute
from cases.wallet_funding_transaction.functions.f003_signed_wire import signed_wire

async def test_confirmed_wire_changes_and_failed_or_parsed_receipts_are_rejected(self):
    different_wire, _ = signed_wire([self.deposit, compute(2, 300000), compute(3, 1000)], self.key)
    for transaction in ([different_wire, 'base64'], [self.wire, 'jsonParsed'], {'message': {'instructions': []}}):
        with self.subTest(type=type(transaction).__name__), self.assertRaisesRegex(ValueError, 'differs'):
            await self.confirm({'result': {'transaction': transaction, 'meta': {'err': None}, 'slot': 123}})
    with self.assertRaisesRegex(ValueError, 'not confirmed successfully'):
        await self.confirm({'result': {'transaction': [self.wire, 'base64'], 'meta': {'err': 'failed'}}})
