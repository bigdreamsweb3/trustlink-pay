from pathlib import Path
from hidden_head_witness import SparseTree
from funding_snapshot_sync import decode_funding_root
from funding_snapshot_sync import ensure_funding_snapshot
from funding_note import funded_leaf
from funding_snapshot_sync import funding_root_address
from cases.funding_note.functions.f001_note import note
from funding_snapshot_sync import publish_snapshot
from cases.funding_note.functions.f002_root_account import root_account
import tempfile
from cases.funding_note.functions.f022_rpc import rpc as _case_f022_rpc
from functools import partial

async def test_wrong_global_pda_and_retired_cached_snapshot_are_rejected(self):
    opening = note()
    leaves = [funded_leaf(opening['commitment'], 7, 1000)]
    state = {**decode_funding_root(root_account(leaves)), 'address': str(funding_root_address()[0])}
    rpc = partial(_case_f022_rpc, leaves)
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory)
        publish_snapshot(path, state['root'], leaves)
        with self.assertRaisesRegex(ValueError, 'canonical root'):
            await ensure_funding_snapshot(path, {**state, 'address': 'forged'}, rpc)
        with self.assertRaisesRegex(ValueError, 'TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT'):
            await ensure_funding_snapshot(path, state, rpc)
