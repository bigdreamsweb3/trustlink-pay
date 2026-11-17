from app.solana_pubkey import _encode_base58

async def test_confirmed_receipt_requires_exact_wallet_wire_and_signature(self):
    receipt = await self.confirm()
    self.assertEqual(receipt, {'signature': self.signature, 'slot': 123, 'amountBaseUnits': '1000000', 'mint': self.payload['tokenMintAddress']})
    self.work['result']['signature'] = _encode_base58(bytes([91]) * 64)
    with self.assertRaisesRegex(ValueError, 'signature does not match'):
        await self.confirm()
