

async def test_insolvency_fails(self):
    self.records[3][140:148] = 1999 .to_bytes(8, 'little')
    with self.assertRaisesRegex(ValueError, 'insolvent'):
        await self.check()
