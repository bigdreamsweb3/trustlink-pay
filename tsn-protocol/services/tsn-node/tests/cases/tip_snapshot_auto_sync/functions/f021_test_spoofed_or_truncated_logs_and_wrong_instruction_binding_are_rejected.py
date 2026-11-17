from app.solana_pubkey import Pubkey
from cases.tip_snapshot_auto_sync.data import REGISTRIES
from cases.tip_snapshot_auto_sync.functions.f003_receipt import receipt
from tip_snapshot_sync import receipt_appends

def test_spoofed_or_truncated_logs_and_wrong_instruction_binding_are_rejected(self):
    signature, tx = receipt(2)
    tx['transaction']['message']['instructions'][0]['accounts'][2] = REGISTRIES[0][0]
    with self.assertRaisesRegex(ValueError, 'account layout'):
        receipt_appends(tx, signature, 100)
    signature, tx = receipt(2)
    tx['meta']['logMessages'].pop()
    with self.assertRaisesRegex(ValueError, 'truncated'):
        receipt_appends(tx, signature, 100)
    signature, tx = receipt(2)
    fake_program = str(Pubkey(bytes([11]) * 32))
    tx['meta']['logMessages'] = [f'Program {fake_program} invoke [1]', 'Program log: TIP V1 route appended to shared membership root at index=2', f'Program {fake_program} success']
    self.assertEqual(receipt_appends(tx, signature, 100), [])
