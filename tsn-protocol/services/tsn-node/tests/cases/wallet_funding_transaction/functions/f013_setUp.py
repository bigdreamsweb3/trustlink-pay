from cases.wallet_funding_transaction.functions.f002_compute import compute
from cases.wallet_funding_transaction.functions.f004_fixture import fixture
from cases.wallet_funding_transaction.functions.f003_signed_wire import signed_wire

def setUp(self):
    self.key, self.deposit, self.context, self.opening = fixture()
    self.wallet = self.context['depositAccounts']['depositor']
    self.wire, self.signature = signed_wire([compute(2, 300000), self.deposit, compute(3, 1000)], self.key)
    self.payload = {'paymentId': 'offline-funding-test', 'intentSeedHash': '00' * 32, 'recipientHash': '11' * 32, 'recipientTin': '1234567890', 'tokenMintAddress': self.context['depositAccounts']['mint'], 'amount': 1, 'senderWallet': self.wallet, 'senderAuthorizationMessage': 'offline-authorization', 'senderAuthorizationSignature': 'offline-signature', 'senderAuthorizationNonce': 'offline-nonce', 'senderSignedFundingTransaction': self.wire, 'senderFundingMode': 'tcap_funded_note_v1', 'fundingNote': self.opening}
    self.work = {'id': 'offline-funding-test', 'kind': 'AUTHORIZED_FUNDING', 'status': 'CONFIRMED', 'payload': self.payload, 'result': {'signature': self.signature}}
    self.tx = {'result': {'transaction': [self.wire, 'base64'], 'meta': {'err': None}, 'slot': 123}}
