from pathlib import Path
from cases.hidden_head_witness.origin import SOURCE_FILE as __file__
from credit_amount import commitment as amount_commitment
import copy
from hidden_head_witness import hex_field
import json
import os
from gpru_crypto import poseidon_v1
import subprocess
import unittest
from cases.hidden_head_witness.functions.f012_calculate import calculate as _case_f012_calculate
from functools import partial

# A fully consistent credit for a different note fails when the only
# public membership anchor is switched to the actual funded-note root.
# Recompute every old action/state relation for a wrong asset or amount;
# the actual deposit's funding root still excludes those fabricated leaves.
# Rebind all existing action/head/nullifier-map relations to a forged
# NF. Only the new secret-derived funding-nullifier relation is false.
@unittest.skipUnless(os.environ.get('GPRU_TEST_CIRCUIT_BUILD_DIR'), 'set an isolated compiled circuit directory for witness checks')
def test_real_circuit_accepts_honest_witness_and_rejects_forged_state(self):
    prepared = self.prepare()
    self.store.finish_credit(prepared, hex_field(101))
    build = Path(os.environ['GPRU_TEST_CIRCUIT_BUILD_DIR'])
    circuit = Path(__file__).resolve().parents[3] / 'programs/gpru/circuits/hidden_head_v1'
    calculate = partial(_case_f012_calculate, build, circuit, self)
    calculate(prepared['witness'], True)
    unfunded = self.prepare(funding_secret=3)
    self.store.finish_credit(unfunded, hex_field(101))
    unfunded['witness']['fundingRoot'] = prepared['witness']['fundingRoot']
    calculate(unfunded['witness'], False)
    for changed in ({'token_id': 8}, {'amount': 1001}):
        rebound = self.prepare(**changed)
        self.store.finish_credit(rebound, hex_field(101))
        rebound['witness']['fundingRoot'] = prepared['witness']['fundingRoot']
        calculate(rebound['witness'], False)
    forged = copy.deepcopy(prepared)
    forged['witness']['nullifier'] += 1
    w = forged['witness']
    w['amountCommitment'] = amount_commitment(w['assetId'], w['amount'], w['amountBlinding'], w['nullifier'])
    w['actionCommitment'] = poseidon_v1([1, w['assetId'], w['amountCommitment'], w['authorizationCommitment'], w['nullifier']])
    self.store.finish_credit(forged, hex_field(101))
    calculate(forged['witness'], False)
    for key in ('oldGlobalRoot', 'amount', 'accountPathKey', 'memoCommitment', 'successorBalanceX', 'encryptedBlindingDelta', 'fundingRoot', 'fundingSecret', 'fundingBlinding', 'nullifier', 'amountCommitment', 'amountBlinding'):
        witness = copy.deepcopy(prepared['witness'])
        witness[key] += 1
        calculate(witness, False)
