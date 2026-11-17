from pathlib import Path
from hidden_head_witness import SparseTree
from cases.funding_note.functions.f003_append_event import append_event
from funding_snapshot_sync import decode_funding_root
from funding_snapshot_sync import ensure_funding_snapshot
from funding_note import funded_leaf
from funding_snapshot_sync import funding_root_address
from cases.funding_note.functions.f001_note import note
from cases.funding_note.functions.f002_root_account import root_account
import tempfile
from cases.funding_note.functions.f014_rpc import rpc as _case_f014_rpc
from functools import partial
from cases.funding_note.functions.f015_changed_rpc import changed_rpc as _case_f015_changed_rpc
from cases.funding_note.functions.f016_retired_rpc import retired_rpc as _case_f016_retired_rpc

async def test_cold_reconstruction_accepts_later_deposits_but_retired_root_stops_publication(self):
    opening = note()
    leaves = [funded_leaf(opening['commitment'], 7, 1000)]
    selected = {**decode_funding_root(root_account(leaves)), 'address': str(funding_root_address()[0])}
    receipt = append_event(0, opening, 7, 1000, leaves)
    receipt['transaction'] = {'signatures': ['public-mock-signature']}
    rpc = partial(_case_f014_rpc, leaves, receipt)
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory)
        result = await ensure_funding_snapshot(path, selected, rpc)
        self.assertTrue(result['published'])
        self.assertFalse((await ensure_funding_snapshot(path, selected, rpc))['published'])
    changed_rpc = partial(_case_f015_changed_rpc, leaves, rpc)
    with tempfile.TemporaryDirectory() as directory:
        result = await ensure_funding_snapshot(Path(directory), selected, changed_rpc)
        self.assertEqual(result['leaves'], leaves)
        self.assertTrue(result['published'])
    retired_rpc = partial(_case_f016_retired_rpc, leaves, rpc)
    with tempfile.TemporaryDirectory() as directory:
        with self.assertRaisesRegex(ValueError, 'TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT'):
            await ensure_funding_snapshot(Path(directory), selected, retired_rpc)
        self.assertEqual(list(Path(directory).iterdir()), [])
