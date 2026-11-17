from pathlib import Path
from cases.tip_snapshot_auto_sync.data import REGISTRIES
from cases.tip_snapshot_auto_sync.functions.f003_receipt import receipt
import tempfile

# Deliberately reverse creation order within one slot. Append indices,
# rather than RPC ordering or timestamps, determine membership order.
def setUp(self):
    self.temporary = tempfile.TemporaryDirectory()
    self.addCleanup(self.temporary.cleanup)
    self.directory = Path(self.temporary.name)
    self.calls = []
    self.root_reads = 0
    self.root_changed = False
    self.receipts = dict((receipt(index, direct=index == 0) for index in range(3)))
    self.entries = [{'signature': signature, 'slot': value['slot'], 'err': None} for signature, value in self.receipts.items()]
    self.entries.reverse()
    self.accounts = {address: data for address, data, _ in REGISTRIES}
