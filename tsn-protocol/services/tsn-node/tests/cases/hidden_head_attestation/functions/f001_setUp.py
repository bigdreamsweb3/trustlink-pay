from nacl.signing import SigningKey
from unittest.mock import patch
from server import runtime as server

# Test fixture, no wallet/transaction signing.
def setUp(self):
    self.key = SigningKey(bytes([42]) * 32)
    self.key_patch = patch.object(server, '_node_verification_signing_key', return_value=self.key)
    self.key_patch.start()
    self.addCleanup(self.key_patch.stop)
    self.transition = {'proof': {'publicInputs': ['01' * 32] * 13}, 'fundingRootAccount': 'mock-funding-root', 'memoPayload': 'mock memo', 'memoBodyPayload': 'mock body'}
    self.work = {'id': 'mock-settlement', 'kind': 'SETTLEMENT', 'payloadCommitment': 'ab' * 32, 'stateVersion': 2, 'nodeLease': {'leaseId': 'mock-lease', 'version': 2}}
    evidence = {'verifiedPayload': {'tcapCreditTransition': self.transition}, 'verificationType': 'TSN_TCAP_GPRU_HIDDEN_HEAD_V1'}
    attestation = server._sign_node_verification(work=self.work, status='VERIFIED', evidence=evidence, verification_type=evidence['verificationType'])
    self.work['verification'] = {'nodeAttestation': attestation}
