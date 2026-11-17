from unittest.mock import AsyncMock
import copy
from datetime import datetime
from unittest.mock import patch
from server import runtime as server
from datetime import timedelta
from datetime import timezone
from cases.hidden_head_authorization.functions.f002_callback import callback as _case_f002_callback
from functools import partial
from cases.hidden_head_authorization.functions.f003_callback import callback as _case_f003_callback
from cases.hidden_head_authorization.functions.f004_callback import callback as _case_f004_callback
from cases.hidden_head_authorization.functions.f005_callback import callback as _case_f005_callback
from cases.hidden_head_authorization.functions.f006_callback import callback as _case_f006_callback

def setUp(self):
    self.proof = {'publicInputs': ['01' * 32] * 13, 'authorizationCommitment': '02' * 32}
    self.transition = {'proof': self.proof, 'memoPayload': 'mock', 'nullifier': 'mock-nullifier', 'amountCommitment': '03' * 32, 'tokenId': 7, 'assetEntry': 'mock-asset', 'reserveState': 'mock-reserve', 'tcapConfig': 'mock-config', 'fundingRootAccount': 'mock-funding-root', 'accountingEpoch': 'mock-epoch'}
    expiry = (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat().replace('+00:00', 'Z')
    self.work = {'id': 'mock-settlement', 'kind': 'SETTLEMENT', 'status': 'CRANKER_LEASED', 'stateVersion': 4, 'crankerLease': {'owner': 'mock-cranker', 'leaseId': 'mock-lease', 'version': 4, 'expiresAt': expiry}, 'payload': {'intentId': 'mock-funding'}, 'verification': {'verificationType': 'TSN_TCAP_GPRU_HIDDEN_HEAD_V1', 'verifiedPayload': {'tcapCreditTransition': self.transition}}}
    self.funding = {'id': 'mock-funding'}
    self.current = copy.deepcopy(self.work)
    self.lookup = AsyncMock(side_effect=partial(_case_f002_callback, self))
    context = {'nullifier': 'mock-nullifier', 'depositAmountBaseUnits': '100', 'depositAccounts': {'reserveState': 'mock-reserve', 'config': 'mock-config', 'fundingRootAccount': 'mock-funding-root'}}
    asset = {'tokenId': 7, 'assetEntry': 'mock-asset'}
    patches = {'_receiver_work_by_id': self.lookup, '_assert_stored_settlement_attestation': _case_f003_callback, '_assert_tcap_credit_transport_capacity': _case_f004_callback, '_settlement_funding_context': AsyncMock(return_value=(None, asset, context)), '_validate_tcap_credit_digest': _case_f005_callback, 'read_opening': _case_f006_callback, '_assert_tcap_gpru_credit_program_preconditions': AsyncMock(), '_read_gpru_proof_accounts': AsyncMock(return_value=(self.proof['publicInputs'][5], b'mock-verifier', 252)), 'prove_hidden_head_credit': AsyncMock(return_value=self.proof)}
    for name, value in patches.items():
        item = patch.object(server, name, value)
        item.start()
        self.addCleanup(item.stop)
