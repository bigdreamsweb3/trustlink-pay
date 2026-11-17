from cases.tip_snapshot_auto_sync.data import REGISTRIES
from cases.tip_snapshot_auto_sync.data import ROOTS

async def test_wrong_registry_or_root_change_cannot_publish(self):
    self.seed(2)
    address, data, _ = REGISTRIES[2]
    self.accounts[address] = data[:-32] + bytes([1]) * 32
    with self.assertRaisesRegex(ValueError, 'confirmed chain root'):
        await self.sync()
    self.accounts[address] = data
    self.root_changed = True
    self.root_reads = 0
    with self.assertRaisesRegex(RuntimeError, 'root changed during'):
        await self.sync()
    self.assertFalse((self.directory / f'tip-{ROOTS[2]}.json').exists())
