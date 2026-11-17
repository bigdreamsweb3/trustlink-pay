from funding_snapshot_sync import FUNDING_ROOT_INVALID
import base64
from funding_snapshot_sync import decode_funding_root
from funding_note import funded_leaf
from cases.funding_note.functions.f001_note import note
from cases.funding_note.functions.f002_root_account import root_account

def test_unallocated_wrong_owner_or_malformed_root_fails(self):
    valid = root_account([funded_leaf(note()['commitment'], 7, 1000)])
    self.assertEqual(decode_funding_root(valid)['count'], 1)
    for changed in (None, {**valid, 'owner': 'wrong'}, {**valid, 'data': [base64.b64encode(bytes(1081)).decode()]}):
        with self.assertRaises(ValueError):
            decode_funding_root(changed)
    zero_root = bytearray(base64.b64decode(valid['data'][0]))
    zero_root[13:45] = bytes(32)
    with self.assertRaisesRegex(ValueError, FUNDING_ROOT_INVALID):
        decode_funding_root({**valid, 'data': [base64.b64encode(zero_root).decode(), 'base64']})
