from pathlib import Path
from hidden_head_witness import SparseTree
from cases.funding_note.functions.f003_append_event import append_event
from funding_snapshot_sync import decode_funding_root
from funding_snapshot_sync import ensure_funding_snapshot
from funding_note import funded_leaf
from funding_snapshot_sync import funding_root_address
from hidden_head_witness import hex_field
from cases.funding_note.functions.f001_note import note
from funding_snapshot_sync import publish_snapshot
from cases.funding_note.functions.f002_root_account import root_account
import tempfile
from cases.funding_note.functions.f012_rpc import rpc as _case_f012_rpc
from functools import partial

# A well-formed cached tree is still not authority for a different prefix.
async def test_cached_prefix_extends_only_when_final_chain_root_matches(self):
    openings = [note(), note(secret=3)]
    leaves = [funded_leaf(opening['commitment'], 7, 1000) for opening in openings]
    selected = {**decode_funding_root(root_account(leaves)), 'address': str(funding_root_address()[0])}
    receipt = append_event(1, openings[1], 7, 1000, leaves)
    receipt['transaction'] = {'signatures': ['latest-public-mock-signature']}
    fetched = []
    rpc = partial(_case_f012_rpc, fetched, leaves, receipt)
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory)
        prefix_root = hex_field(SparseTree(32, {0: leaves[0]}).root)
        publish_snapshot(path, prefix_root, leaves[:1])
        self.assertEqual((await ensure_funding_snapshot(path, selected, rpc))['leaves'], leaves)
        self.assertEqual(fetched, ['latest-public-mock-signature'])
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory)
        wrong_leaf = funded_leaf(note(secret=5)['commitment'], 7, 1000)
        publish_snapshot(path, hex_field(SparseTree(32, {0: wrong_leaf}).root), [wrong_leaf])
        with self.assertRaisesRegex(ValueError, 'chain-selected root'):
            await ensure_funding_snapshot(path, selected, rpc)
        self.assertFalse((path / f"funding-{selected['root']}.json").exists())
