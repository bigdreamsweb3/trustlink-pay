import json

async def test_corrupt_current_snapshot_is_rejected_without_using_old_state(self):
    self.seed(2)
    current = self.seed(3)
    current.write_text(json.dumps({'version': 1, 'leaves': ['1']}))
    with self.assertRaisesRegex(ValueError, 'selected root'):
        await self.sync()
    self.assertEqual(self.calls, [])
