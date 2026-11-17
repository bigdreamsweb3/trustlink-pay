

async def test_transfer_liabilities_are_included(self):
    self.records[3][193:201] = 1 .to_bytes(8, 'little')
    with self.assertRaisesRegex(ValueError, 'insolvent'):
        await self.check()
