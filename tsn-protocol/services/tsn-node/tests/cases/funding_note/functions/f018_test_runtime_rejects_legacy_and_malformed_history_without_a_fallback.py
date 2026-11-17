from gpru_crypto import BABYJUB_FIELD
from funding_snapshot_sync import FUNDING_ROOT_INVALID
import base64
from funding_snapshot_sync import decode_funding_root
from funding_note import funded_leaf
from cases.funding_note.functions.f001_note import note
from cases.funding_note.functions.f002_root_account import root_account

def test_runtime_rejects_legacy_and_malformed_history_without_a_fallback(self):
    valid = root_account([funded_leaf(note()['commitment'], 7, 1000)])
    original = base64.b64decode(valid['data'][0])
    changes = [(8, b'\x01\x00'), (1081, 127 .to_bytes(4, 'little')), (6205, bytes(2)), (6207, 129 .to_bytes(2, 'little')), (1085, bytes(32)), (1117, bytes(8)), (1125, b'\x01'), (13, bytes(32)), (1085, BABYJUB_FIELD.to_bytes(32, 'big')), (1117, 2 .to_bytes(8, 'little'))]
    malformed = [original[:1081]]
    for offset, value in changes:
        changed = bytearray(original)
        changed[offset:offset + len(value)] = value
        malformed.append(changed)
    for data in malformed:
        with self.subTest(length=len(data)), self.assertRaisesRegex(ValueError, FUNDING_ROOT_INVALID):
            decode_funding_root({**valid, 'data': [base64.b64encode(data).decode(), 'base64']})
