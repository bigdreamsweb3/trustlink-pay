from cases.tip_snapshot_auto_sync.data import REGISTRIES
from cases.tip_snapshot_auto_sync.data import ROOTS
import json

def seed(self, count):
    path = self.directory / f'tip-{ROOTS[count - 1]}.json'
    path.write_text(json.dumps({'version': 1, 'leaves': [str(r[2]) for r in REGISTRIES[:count]]}))
    return path
