

async def test_root_change_fails(self):
    self.records[1][12] ^= 1
    with self.assertRaisesRegex(ValueError, 'authorized predecessor'):
        await self.check()
