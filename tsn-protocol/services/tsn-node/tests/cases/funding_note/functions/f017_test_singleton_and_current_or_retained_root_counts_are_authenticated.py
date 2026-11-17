from hidden_head_witness import SparseTree
from funding_snapshot_sync import decode_funding_root
from funding_note import funded_leaf
from hidden_head_witness import hex_field
from cases.funding_note.functions.f001_note import note
from cases.funding_note.functions.f002_root_account import root_account
from funding_snapshot_sync import select_funding_root

def test_singleton_and_current_or_retained_root_counts_are_authenticated(self):
    leaves = [funded_leaf(note(secret=secret)['commitment'], 7, 1000) for secret in (1, 3)]
    state = decode_funding_root(root_account(leaves))
    prior = hex_field(SparseTree(32, {0: leaves[0]}).root)
    self.assertEqual(select_funding_root(state, prior, 1)['count'], 1)
    self.assertEqual(select_funding_root(state, state['root'], 2)['count'], 2)
    for root, count in ((hex_field(1), 1), (prior, 2)):
        with self.assertRaisesRegex(ValueError, 'TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT'):
            select_funding_root(state, root, count)
