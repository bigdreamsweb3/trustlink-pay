from pathlib import Path
from cases.tip_snapshot_sync.data import sync
import tempfile

def test_conflicting_existing_snapshot_cannot_be_overwritten(self):
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory)
        candidate = sync.extend_snapshot(self.snapshot, self.base, [self.second], self.root, 2)
        target = sync.publish(path, self.root, candidate)
        sync.publish(path, self.root, candidate)
        original = target.read_bytes()
        with self.assertRaisesRegex(ValueError, 'conflicting'):
            sync.publish(path, self.root, self.snapshot)
        self.assertEqual(target.read_bytes(), original)
        self.assertEqual(list(path.glob('*.tmp')), [])
