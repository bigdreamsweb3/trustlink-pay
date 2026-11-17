from cases.tip_snapshot_auto_sync.data import ROOTS

async def test_missing_receipt_or_append_history_never_publishes(self):
    self.seed(2)
    signature = self.entries[0]['signature']
    self.receipts[signature] = None
    with self.assertRaisesRegex(RuntimeError, 'receipt is missing'):
        await self.sync()
    self.entries = self.entries[1:]
    with self.assertRaisesRegex(RuntimeError, 'history is incomplete'):
        await self.sync()
    self.assertFalse((self.directory / f'tip-{ROOTS[2]}.json').exists())
