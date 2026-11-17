

async def test_new_tin_auto_extends_snapshot_preserves_old_state_and_reuses_matching_cache(self):
    base = self.seed(2)
    original = base.read_bytes()
    result = await self.sync()
    self.assertEqual(result, {'published': True, 'routeCount': 3})
    self.assert_current_snapshot()
    self.assertEqual(base.read_bytes(), original)
    calls = len(self.calls)
    self.assertEqual(await self.sync(), {'published': False, 'routeCount': 3})
    self.assertEqual(len(self.calls), calls)
