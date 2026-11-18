import copy
from unittest.mock import patch
from server import runtime as node
from verification.work.funding_authorization_preflight import funding_authorization_preflight


def test_readiness_integrity(self):
    with patch.object(node, '_node_verification_signing_key', return_value=self.key):
        self.assertEqual(funding_authorization_preflight(node, self.work), self.preflight)
        for field in ('depositAmountBaseUnits', 'fundingNoteCommitment', 'authorizationPayloadCommitment'):
            changed = copy.deepcopy(self.work)
            changed['authorizationPreflight'][field] = 'changed'
            with self.assertRaises(ValueError):
                funding_authorization_preflight(node, changed)
        changed = copy.deepcopy(self.work)
        changed['fundingReadiness']['expiresAt'] = '2099-02-01T00:00:00Z'
        with self.assertRaises(ValueError):
            funding_authorization_preflight(node, changed)
