

async def test_lagging_bank_can_fall_through_to_valid_simulation(self):
    result = await self.simulate([{'result': {'value': {'err': 'BlockhashNotFound'}}}, {'result': {'value': {'err': None, 'units': 42}}}])
    self.assertEqual(result['programSimulation'], 'PASSED')
