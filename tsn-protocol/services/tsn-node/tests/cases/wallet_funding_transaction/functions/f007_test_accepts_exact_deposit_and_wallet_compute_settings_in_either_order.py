from cases.wallet_funding_transaction.functions.f002_compute import compute

def test_accepts_exact_deposit_and_wallet_compute_settings_in_either_order(self):
    budget = [compute(2, 300000), compute(3, 1000)]
    for instructions in ([self.deposit], [self.deposit, *budget], [*budget, self.deposit], [compute(1, 64 * 1024), self.deposit, compute(4, 32 * 1024 * 1024)], [compute(3, 0), self.deposit]):
        with self.subTest(programs=[instruction[0] for instruction in instructions]):
            self.verify(instructions)
