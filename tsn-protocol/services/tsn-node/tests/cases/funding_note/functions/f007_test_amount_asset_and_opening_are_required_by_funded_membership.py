from hidden_head_witness import SparseTree
from funding_note import funded_leaf
from funding_snapshot_sync import funding_membership
from hidden_head_witness import hex_field
from cases.funding_note.functions.f001_note import note

def test_amount_asset_and_opening_are_required_by_funded_membership(self):
    opening = note()
    leaf = funded_leaf(opening['commitment'], 7, 1000)
    tree = SparseTree(32, {0: leaf})
    snapshot = {'root': hex_field(tree.root), 'leaves': [leaf]}
    self.assertEqual(funding_membership(snapshot, opening['commitment'], 7, 1000)['fundingIndex'], 0)
    for commitment, token, amount in ((opening['commitment'], 8, 1000), (opening['commitment'], 7, 1001), (note(secret=3)['commitment'], 7, 1000)):
        with self.assertRaisesRegex(ValueError, 'no membership'):
            funding_membership(snapshot, commitment, token, amount)
