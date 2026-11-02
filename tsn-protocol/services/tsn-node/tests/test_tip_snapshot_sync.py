import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from gpru_crypto import poseidon_v1
from hidden_head_witness import SparseTree, hex_field

ROOT = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location("tip_snapshot_sync", ROOT / "scripts/sync-tip-witness.py")
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class TipSnapshotSyncTests(unittest.TestCase):
    def setUp(self):
        self.first, self.second = poseidon_v1([1, 2]), poseidon_v1([3, 4])
        self.base = hex_field(SparseTree(32, {0: self.first}).root)
        self.root = hex_field(SparseTree(32, {0: self.first, 1: self.second}).root)
        self.snapshot = {"version": 1, "leaves": [str(self.first)]}

    def test_append_matches_exact_chain_root_and_keeps_prior_snapshot(self):
        original = json.dumps(self.snapshot)
        result = sync.extend_snapshot(self.snapshot, self.base, [self.second], self.root, 2)
        self.assertEqual(result["leaves"], [str(self.first), str(self.second)])
        self.assertEqual(json.dumps(self.snapshot), original)

    def test_wrong_append_order_count_or_base_is_rejected(self):
        for base, leaves, root, count in (
            (self.base, [self.first], self.root, 2), (self.base, [self.second], self.root, 3),
            (self.root, [self.second], self.root, 2), (self.base, [self.second], self.base, 2),
        ):
            with self.subTest(count=count, root=root), self.assertRaises(ValueError):
                sync.extend_snapshot(self.snapshot, base, leaves, root, count)

    def test_conflicting_existing_snapshot_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            candidate = sync.extend_snapshot(self.snapshot, self.base, [self.second], self.root, 2)
            target = sync.publish(path, self.root, candidate)
            sync.publish(path, self.root, candidate)
            original = target.read_bytes()
            with self.assertRaisesRegex(ValueError, "conflicting"):
                sync.publish(path, self.root, self.snapshot)
            self.assertEqual(target.read_bytes(), original)
            self.assertEqual(list(path.glob("*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
