

async def test_all_banks_explicitly_reject_hash_requires_new_signature(self):
    with self.assertRaisesRegex(ValueError, 'prepare and sign a fresh'):
        await self.simulate([{'result': {'value': {'err': 'BlockhashNotFound'}}}] * 2)
