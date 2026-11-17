

async def test_expired_slot_window_fails(self):
    self.transition['expiresAtSlot'] = '49'
    with self.assertRaisesRegex(ValueError, 'slot validity window'):
        await self.check()
