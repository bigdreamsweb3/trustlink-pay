

async def test_singleton_funded_note_is_eligible_without_another_wallet(self):
    self.assertEqual(self.funding_state['count'], 1)
    await self.check()
