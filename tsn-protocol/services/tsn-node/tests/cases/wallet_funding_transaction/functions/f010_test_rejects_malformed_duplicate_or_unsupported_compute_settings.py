from cases.wallet_funding_transaction.data import COMPUTE_PROGRAM
from cases.wallet_funding_transaction.functions.f002_compute import compute

def test_rejects_malformed_duplicate_or_unsupported_compute_settings(self):
    invalid = [(COMPUTE_PROGRAM, [], b''), (COMPUTE_PROGRAM, [], bytes([0]) + bytes(8)), (COMPUTE_PROGRAM, [], bytes([5]) + bytes(4)), (COMPUTE_PROGRAM, [], b'\x02' + bytes(3)), (COMPUTE_PROGRAM, [], b'\x03' + bytes(9)), (COMPUTE_PROGRAM, [self.wallet], compute(2, 300000)[2]), compute(1, 31 * 1024), compute(1, 257 * 1024), compute(1, 32 * 1024 + 1), compute(2, 0), compute(4, 0)]
    for instruction in invalid:
        with self.subTest(data_length=len(instruction[2])), self.assertRaises(ValueError):
            self.verify([self.deposit, instruction])
    for tag, value in ((1, 32 * 1024), (2, 300000), (3, 0), (4, 32 * 1024)):
        with self.subTest(duplicate_tag=tag), self.assertRaisesRegex(ValueError, 'unsupported additional'):
            self.verify([self.deposit, compute(tag, value), compute(tag, value)])
