from cases.tip_snapshot_auto_sync.data import REGISTRIES
from cases.tip_snapshot_auto_sync.data import ROOTS
import json

def assert_current_snapshot(self):
    document = json.loads((self.directory / f'tip-{ROOTS[2]}.json').read_text())
    self.assertEqual(document, {'version': 1, 'leaves': [str(r[2]) for r in REGISTRIES]})
