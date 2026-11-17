

async def test_wrong_reserve_binding_fails(self):
    self.records[2] = self.asset_entry(reserve_state=bytes([11]) * 32)
    with self.assertRaisesRegex(ValueError, 'reserve binding'):
        await self.check()
