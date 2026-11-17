from cases.wallet_funding_transaction.data import COMPUTE_PROGRAM
from cases.wallet_funding_transaction.functions.f002_compute import compute

def test_rejects_missing_duplicate_or_wrong_program_deposits(self):
    for instructions in ([], [compute(2, 300000)], [self.deposit, self.deposit], [(COMPUTE_PROGRAM, self.deposit[1], self.deposit[2])]):
        with self.subTest(count=len(instructions)), self.assertRaisesRegex(ValueError, 'exactly one'):
            self.verify(instructions)
