from pathlib import Path
from private_credit_coordination import PrivateCreditWait
from private_credit_coordination import build_epoch_witness
from hidden_head_witness import hex_field
import json
import tempfile

def test_complete_epoch_requires_exact_order_and_all_openings(self):
    with tempfile.TemporaryDirectory() as tmp:
        directory = Path(tmp)
        epoch, rows = self.fixture(directory)
        witness = build_epoch_witness(epoch, rows[::-1], directory)
        self.assertEqual(witness['total'], 500)
        for e, r in [({**epoch, 'digest': hex_field(1)}, rows), (epoch, rows[:1]), (epoch, [rows[0], rows[0]]), ({**epoch, 'count': 1}, rows[:1])]:
            with self.assertRaises((ValueError, PrivateCreditWait)):
                build_epoch_witness(e, r, directory)
        file = directory / 'credit-openings' / (rows[0]['amountCommitment'] + '.json')
        data = json.loads(file.read_text())
        data['amount'] = '101'
        file.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'OPENING_MISMATCH'):
            build_epoch_witness(epoch, rows, directory)
