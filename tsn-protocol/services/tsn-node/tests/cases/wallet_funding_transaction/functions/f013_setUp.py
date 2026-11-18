from cases.wallet_funding_transaction.functions.f002_compute import compute
from cases.wallet_funding_transaction.functions.f004_fixture import fixture
from cases.wallet_funding_transaction.functions.f003_signed_wire import signed_wire
from app.solana_pubkey import Pubkey
import base64
from unittest.mock import patch
from server import runtime as server

def setUp(self):
    self.key, self.deposit, self.context, self.opening = fixture()
    self.wallet = self.context['depositAccounts']['depositor']
    self.wire, self.signature = signed_wire([compute(2, 300000), self.deposit, compute(3, 1000)], self.key)
    self.payload = {'paymentId': 'offline-funding-test', 'intentSeedHash': '00' * 32, 'recipientHash': '11' * 32, 'recipientTin': '1234567890', 'tokenMintAddress': self.context['depositAccounts']['mint'], 'amount': 1, 'senderWallet': self.wallet, 'senderAuthorizationMessage': 'offline-authorization', 'senderAuthorizationSignature': 'offline-signature', 'senderAuthorizationNonce': 'offline-nonce', 'senderSignedFundingTransaction': self.wire, 'senderFundingMode': 'tcap_funded_note_v1', 'fundingNote': self.opening}
    self.payload['senderFundingBlockhashContext'] = {'blockhash': str(Pubkey(bytes([99]) * 32)), 'lastValidBlockHeight': 1000, 'contextSlot': 123}
    self.work = {'id': 'offline-funding-test', 'kind': 'AUTHORIZED_FUNDING', 'status': 'CONFIRMED', 'payload': self.payload, 'result': {'signature': self.signature}}
    self.tx = {'result': {'transaction': [self.wire, 'base64'], 'meta': {'err': None}, 'slot': 123}}
    self.payload['senderAuthorizationSignature'] = base64.b64encode(self.key.sign(b'offline-authorization').signature).decode()
    accounts = {**self.context['depositAccounts'], 'tcapProgramId': server.TCAP_PROGRAM_ID}
    fields = {'tokenDecimals': 6, 'tcapAssetEntry': accounts['assetEntry'], 'tokenProgram': accounts['tokenProgram'],
              'senderAuthorizationNonce': self.payload['senderAuthorizationNonce'], 'senderAuthorizationExpiresAt': '2099-01-01T00:00:00Z'}
    self.preflight = {**self.context, 'depositAccounts': accounts, 'verifiedFields': fields,
                      'authorizationPayloadCommitment': '22' * 32}
    readiness = {'expiresAt': '2099-01-01T00:00:00Z', 'authorizationPayloadCommitment': '22' * 32}
    lease = {'source': 'tsn-receiver', 'workId': self.work['id'], 'kind': 'AUTHORIZED_FUNDING', 'stateVersion': 2, 'payloadCommitment': '22' * 32}
    evidence = {'verificationType': 'TSN_FUNDING_AUTHORIZATION_READY', 'authorizationPreflight': self.preflight, 'fundingReadiness': readiness, 'receiverLease': lease}
    with patch.object(server, '_node_verification_signing_key', return_value=self.key):
        attestation = server._sign_node_verification(work={**self.work, 'payloadCommitment': '22' * 32}, status='FUNDING_READY', evidence=evidence, verification_type=evidence['verificationType'])
    self.work.update({'fundingPhase': 'SIGNED_DEPOSIT', 'authorizationPayloadCommitment': '22' * 32,
                      'authorizationPreflight': self.preflight, 'fundingReadiness': readiness, 'fundingReadinessAttestation': attestation,
                      'fundingReadinessReceiverLease': lease, 'stateVersion': 4})
