from funding_snapshot_sync import FUNDING_ROOT_INVALID
import base64
from funding_snapshot_sync import decode_funding_root
from hidden_head_witness import hex_field
from cases.funding_note.functions.f002_root_account import root_account
from funding_snapshot_sync import select_funding_root

def test_wrapped_full_history_is_chronological_and_retires_its_oldest_root(self):
    account = root_account([])
    data = bytearray(base64.b64decode(account['data'][0]))
    cursor = 7
    data[13:45] = 129 .to_bytes(32, 'big')
    data[45:53] = 129 .to_bytes(8, 'little')
    data[6205:6207] = cursor.to_bytes(2, 'little')
    data[6207:6209] = 128 .to_bytes(2, 'little')
    for index, count in enumerate(range(2, 130)):
        offset = 1085 + (cursor + index) % 128 * 40
        data[offset:offset + 40] = count.to_bytes(32, 'big') + count.to_bytes(8, 'little')
    wrapped = {**account, 'data': [base64.b64encode(data).decode(), 'base64']}
    state = decode_funding_root(wrapped)
    self.assertEqual([row['count'] for row in state['history']], list(range(2, 130)))
    self.assertEqual(select_funding_root(state, hex_field(2), 2)['count'], 2)
    with self.assertRaisesRegex(ValueError, 'TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT'):
        select_funding_root(state, hex_field(1), 1)
    broken = bytearray(data)
    broken[6205:6207] = 8 .to_bytes(2, 'little')
    with self.assertRaisesRegex(ValueError, FUNDING_ROOT_INVALID):
        decode_funding_root({**account, 'data': [base64.b64encode(broken).decode(), 'base64']})
