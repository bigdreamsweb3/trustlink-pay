from cases.tip_snapshot_auto_sync.data import ROOTS
from app.solana_pubkey import _encode_base58
from cases.tip_snapshot_auto_sync.functions.f003_receipt import receipt

async def test_failed_creation_is_skipped_and_duplicate_indices_are_rejected(self):
    self.seed(2)
    self.entries.insert(0, {'signature': 'failed', 'slot': 100, 'err': {'InstructionError': [0, 'failed']}})
    await self.sync()
    self.assertFalse(any((method == 'getTransaction' and params[0] == 'failed' for method, params in self.calls)))
    (self.directory / f'tip-{ROOTS[2]}.json').unlink()
    (self.directory / f'tip-{ROOTS[1]}.json').unlink()
    self.seed(1)
    signature, tx = receipt(2)
    other_signature = _encode_base58(bytes([22]) * 64)
    tx['transaction']['signatures'] = [other_signature]
    self.receipts[other_signature] = tx
    self.entries.insert(2, {'signature': other_signature, 'slot': 100, 'err': None})
    with self.assertRaisesRegex(ValueError, 'repeats a creation index'):
        await self.sync()
