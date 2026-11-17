from pathlib import Path
from hidden_head_witness import SparseTree
from funding_note import funded_leaf
from hidden_head_witness import hex_field
import json
from cases.funding_note.functions.f001_note import note
from funding_snapshot_sync import publish_snapshot
import tempfile
from funding_snapshot_sync import validate_snapshot

def test_public_snapshot_has_no_openings_and_is_immutable(self):
    leaves = [funded_leaf(note()['commitment'], 7, 1000)]
    root = hex_field(SparseTree(32, {0: leaves[0]}).root)
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory)
        publish_snapshot(path, root, leaves)
        publish_snapshot(path, root, leaves)
        data = json.loads((path / f'funding-{root}.json').read_text())
        self.assertEqual(set(data), {'version', 'leaves'})
        self.assertEqual(validate_snapshot(data, root, 1), leaves)
        with self.assertRaisesRegex(ValueError, 'unsupported field set'):
            validate_snapshot({**data, 'version': True}, root, 1)
        with self.assertRaisesRegex(ValueError, 'different funding snapshot'):
            publish_snapshot(path, root, [leaves[0] + 1])
