from cases.wallet_funding_transaction.functions.f004_fixture import fixture

def setUp(self):
    self.key, self.deposit, self.context, self.opening = fixture()
    self.wallet = self.context['depositAccounts']['depositor']
