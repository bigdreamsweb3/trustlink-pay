import json
from cases.tip_snapshot_sync.data import sync

def test_append_matches_exact_chain_root_and_keeps_prior_snapshot(self):
    original = json.dumps(self.snapshot)
    result = sync.extend_snapshot(self.snapshot, self.base, [self.second], self.root, 2)
    self.assertEqual(result['leaves'], [str(self.first), str(self.second)])
    self.assertEqual(json.dumps(self.snapshot), original)
