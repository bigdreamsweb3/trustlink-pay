from funding_snapshot_sync import decode_funding_root
from cases.funding_note.functions.f002_root_account import root_account

def test_empty_tree_has_no_active_history(self):
    state = decode_funding_root(root_account([]))
    self.assertEqual((state['count'], state['history']), (0, []))
