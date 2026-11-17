from cases.tip_snapshot_auto_sync.data import ROOTS
from tip_snapshot_sync import ensure_tip_snapshot

async def sync(self, **options):
    return await ensure_tip_snapshot(self.directory, ROOTS[2], self.rpc, **options)
