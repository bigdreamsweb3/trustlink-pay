from cases.tip_snapshot_auto_sync.data import ROOTS

async def test_read_only_preview_verifies_real_pipeline_without_publishing(self):
    self.seed(2)
    self.assertEqual(await self.sync(publish_snapshot=False), {'published': False, 'routeCount': 3})
    self.assertFalse((self.directory / f'tip-{ROOTS[2]}.json').exists())
