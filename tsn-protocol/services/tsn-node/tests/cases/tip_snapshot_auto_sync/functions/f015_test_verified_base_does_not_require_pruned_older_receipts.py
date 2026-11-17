

async def test_verified_base_does_not_require_pruned_older_receipts(self):
    self.seed(2)
    for entry in self.entries[1:]:
        self.receipts[entry['signature']] = None
    await self.sync()
    self.assert_current_snapshot()
