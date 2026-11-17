from pathlib import Path
from app.solana_pubkey import Pubkey
import asyncio
import base64
from private_credit_coordination import build_epoch_witness
import copy
import hashlib
from hidden_head_witness import hex_field
import json
import os
from unittest.mock import patch
import tempfile
import unittest
from cases.private_credit_coordination.functions.f029_rpc import rpc as _case_f029_rpc
from functools import partial
from cases.private_credit_coordination.functions.f030_run import run as _case_f030_run

@unittest.skipUnless(os.environ.get('GPRU_TEST_EPOCH_PROVER_DIR'), 'matching isolated development epoch keys required')
def test_real_epoch_proof_serialized_reverification_and_mutations(self):
    from tcap_epoch_prover import prove_epoch, GPRU
    build = Path(os.environ['GPRU_TEST_EPOCH_BUILD_DIR'])
    artifacts = Path(os.environ['GPRU_TEST_EPOCH_PROVER_DIR'])
    metadata = artifacts / 'dev-setup.json'
    args = json.loads((artifacts / 'verifier-init-args.json').read_text())
    points = b''.join((bytes(args[k]) for k in ('alpha_g1', 'beta_g2', 'gamma_g2', 'delta_g2'))) + b''.join((bytes(p) for p in args['ic']))
    address, bump = Pubkey.find_program_address([b'gpru:tcap-epoch-verifier:v1'], Pubkey.from_string(GPRU))
    data = hashlib.sha256(b'account:GpruTcapEpochVerifierV1').digest()[:8] + b'\x01\x00' + bytes(32) + bytes(args['circuit_commitment']) + bytes(args['key_commitment']) + bytes([1, bump]) + points
    self.assertEqual(len(data), 940)
    rpc = partial(_case_f029_rpc, GPRU, address, data, self)
    environment = {'GPRU_EPOCH_CIRCUIT_BUILD_DIR': str(build), 'GPRU_EPOCH_CIRCUIT_WASM_PATH': str(build / 'main_js/main.wasm'), 'GPRU_EPOCH_PROVING_KEY_PATH': str(artifacts / 'tcap_epoch_dev_only.zkey'), 'GPRU_EPOCH_VERIFICATION_KEY_PATH': str(artifacts / 'verification_key.json'), 'GPRU_EPOCH_PROVER_METADATA_PATH': str(metadata), 'GPRU_EPOCH_PROVER_METADATA_SHA256': hashlib.sha256(metadata.read_bytes()).hexdigest()}
    with tempfile.TemporaryDirectory() as tmp:
        epoch, rows = self.fixture(Path(tmp))
        witness = build_epoch_witness(epoch, rows, Path(tmp))
        run = partial(_case_f030_run, points, prove_epoch, rpc, self, witness)
        with patch.dict(os.environ, environment):
            asyncio.run(run())
