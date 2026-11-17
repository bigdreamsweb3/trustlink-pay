from server import runtime as server

async def test_new_deposit_preserves_credit_against_authenticated_prior_root(self):
    original = self.funding_state.copy()
    self.funding_state = {**original, 'root': '03' * 32, 'count': 2, 'history': [{'root': original['root'], 'count': 1}]}
    await self.check()
    self.funding_state['history'] = []
    with self.assertRaisesRegex(ValueError, server.FUNDING_ROOT_CHANGED):
        await self.check()
