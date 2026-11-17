from pathlib import Path
from private_credit_coordination import build_epoch_witness
import copy
import json
import os
import subprocess
import tempfile
import unittest
from cases.private_credit_coordination.functions.f005_calculate import calculate as _case_f005_calculate
from functools import partial

@unittest.skipUnless(os.environ.get('GPRU_TEST_EPOCH_BUILD_DIR'), 'compile isolated epoch circuit for witness checks')
def test_epoch_circuit_rejects_changed_total_count_opening_and_order(self):
    with tempfile.TemporaryDirectory() as tmp:
        directory = Path(tmp)
        epoch, rows = self.fixture(directory)
        witness = build_epoch_witness(epoch, rows, directory)
        build = Path(os.environ['GPRU_TEST_EPOCH_BUILD_DIR'])
        calculate = partial(_case_f005_calculate, build, directory, self)
        calculate(witness, True)
        for name in ('total', 'count', 'digest', 'tokenId'):
            w = copy.deepcopy(witness)
            w[name] += 1
            calculate(w, False)
        for name in ('amounts', 'blindings', 'nullifiers'):
            w = copy.deepcopy(witness)
            w[name][0] += 1
            calculate(w, False)
        w = copy.deepcopy(witness)
        for name in ('amounts', 'blindings', 'nullifiers'):
            w[name][:2] = w[name][:2][::-1]
        calculate(w, False)
