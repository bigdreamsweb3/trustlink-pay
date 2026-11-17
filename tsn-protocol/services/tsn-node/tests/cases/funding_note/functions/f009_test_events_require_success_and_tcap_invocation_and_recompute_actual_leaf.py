from cases.funding_note.functions.f003_append_event import append_event
import base64
import copy
from funding_snapshot_sync import decode_append_events
from funding_note import funded_leaf
from funding_snapshot_sync import funding_root_address
from cases.funding_note.functions.f001_note import note

# Actual deposit amount; cannot retain the original leaf.
def test_events_require_success_and_tcap_invocation_and_recompute_actual_leaf(self):
    opening = note()
    leaf = funded_leaf(opening['commitment'], 7, 1000)
    receipt = append_event(0, opening, 7, 1000, [leaf])
    address = str(funding_root_address()[0])
    self.assertEqual(decode_append_events(receipt, address)[0]['leaf'], leaf)
    failed = copy.deepcopy(receipt)
    failed['meta']['err'] = {'InstructionError': [0, 'InvalidArgument']}
    with self.assertRaises(ValueError):
        decode_append_events(failed, address)
    outside = copy.deepcopy(receipt)
    outside['meta']['logMessages'] = [receipt['meta']['logMessages'][1]]
    self.assertEqual(decode_append_events(outside, address), [])
    tampered = copy.deepcopy(receipt)
    event = bytearray(base64.b64decode(tampered['meta']['logMessages'][1][14:]))
    event[84] ^= 1
    tampered['meta']['logMessages'][1] = 'Program data: ' + base64.b64encode(event).decode()
    with self.assertRaisesRegex(ValueError, 'leaf'):
        decode_append_events(tampered, address)
