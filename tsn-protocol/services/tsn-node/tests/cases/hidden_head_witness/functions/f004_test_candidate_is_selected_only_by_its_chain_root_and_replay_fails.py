from hidden_head_witness import SparseTree
from hidden_head_witness import hex_field

def test_candidate_is_selected_only_by_its_chain_root_and_replay_fails(self):
    original = self.state_path.read_bytes()
    prepared = self.prepare()
    self.assertEqual(prepared['witness']['priorSequence'], 0)
    self.assertEqual(prepared['witness']['isFirstToken'], 1)
    self.store.finish_credit(prepared, hex_field(101))
    self.store.save_candidate(prepared)
    candidate = (self.directory / f"tcap-{hex_field(prepared['witness']['newGlobalRoot'])}.json").read_text()
    for name in ('fundingSecret', 'fundingBlinding', 'fundingIndex', 'fundingSiblings', 'fundingNote'):
        self.assertNotIn(name, candidate)
    self.assertEqual(original, self.state_path.read_bytes())
    next_root = hex_field(prepared['witness']['newGlobalRoot'])
    with self.assertRaisesRegex(ValueError, 'already been used'):
        self.prepare(old_root=next_root)
    second = self.prepare(old_root=next_root, funding_secret=2)
    self.assertEqual(second['witness']['priorSequence'], 1)
    self.assertEqual(second['witness']['isFirstToken'], 0)
    third = self.prepare(old_root=next_root, funding_secret=2, token_id=8)
    self.assertEqual(third['witness']['isFirstToken'], 1)
    self.assertNotEqual(third['witness']['predecessorPortfolioRoot'], SparseTree(32, {}).root)
