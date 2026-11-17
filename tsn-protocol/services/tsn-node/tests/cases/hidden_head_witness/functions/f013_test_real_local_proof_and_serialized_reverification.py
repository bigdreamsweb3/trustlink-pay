from pathlib import Path
from cases.hidden_head_witness.origin import SOURCE_FILE as __file__
import asyncio
import copy
import hashlib
from hidden_head_witness import hex_field
import json
import os
from unittest.mock import patch
import unittest
from cases.hidden_head_witness.functions.f014_scalar import scalar as _case_f014_scalar
from cases.hidden_head_witness.functions.f015_g1 import g1 as _case_f015_g1
from functools import partial
from cases.hidden_head_witness.functions.f016_g2 import g2 as _case_f016_g2
from cases.hidden_head_witness.functions.f017_run import run as _case_f017_run

# Bind a test-only copy after confirming the independently compiled
# source produces the R1CS/WASM already bound to these existing keys.
# No key setup, deployment, service change or real-chain fixture occurs.
@unittest.skipUnless(os.environ.get('GPRU_TEST_PROVER_DIR') and os.environ.get('GPRU_TEST_CIRCUIT_BUILD_DIR'), 'provide existing matching development artifacts for the offline Groth16 test')
def test_real_local_proof_and_serialized_reverification(self):
    from hidden_head_prover import prove_hidden_head_credit
    circuit = Path(__file__).resolve().parents[3] / 'programs/gpru/circuits/hidden_head_v1'
    build = Path(os.environ['GPRU_TEST_CIRCUIT_BUILD_DIR'])
    artifacts = Path(os.environ['GPRU_TEST_PROVER_DIR'])
    metadata = json.loads((artifacts / 'dev-setup.json').read_text())
    for name, filename in (('r1csSha256', build / 'main.r1cs'), ('witnessWasmSha256', build / 'main_js/main.wasm')):
        self.assertEqual(hashlib.sha256(filename.read_bytes()).hexdigest(), metadata[name])
    source = (circuit / 'main.circom').read_bytes()
    metadata['circuitSourceSha256'] = hashlib.sha256(source).hexdigest()
    metadata_path = self.directory / 'mock-pinned-manifest.json'
    metadata_path.write_text(json.dumps(metadata))
    vk = json.loads((artifacts / 'verification_key.json').read_text())
    scalar = _case_f014_scalar
    g1 = partial(_case_f015_g1, scalar)
    g2 = partial(_case_f016_g2, scalar)
    points = g1(vk['vk_alpha_1']) + g2(vk['vk_beta_2']) + g2(vk['vk_gamma_2']) + g2(vk['vk_delta_2']) + b''.join((g1(v) for v in vk['IC']))
    self.assertEqual(len(points), 1344)
    circuit_commitment = hashlib.sha256(b'TSN_GPRU_HIDDEN_HEAD_CIRCUIT_V1\x00' + source + b'circomlib-poseidon-bn254-v1').digest()
    key_commitment = hashlib.sha256(b'TSN_GPRU_GROTH16_VERIFYING_KEY_V1\x00' + points).digest()
    fixture_verifier = hashlib.sha256(b'account:GpruHiddenHeadVerifierV2').digest()[:8] + b'\x02\x00' + bytes(32) + circuit_commitment + key_commitment + b'\x01\xff' + points
    prepared = self.prepare()
    self.store.finish_credit(prepared, hex_field(101))
    environment = {'GPRU_CIRCUIT_BUILD_DIR': str(build), 'GPRU_CIRCUIT_WASM_PATH': str(build / 'main_js/main.wasm'), 'GPRU_PROVING_KEY_PATH': str(artifacts / 'hidden_head_dev_only.zkey'), 'GPRU_VERIFICATION_KEY_PATH': str(artifacts / 'verification_key.json'), 'GPRU_PROVER_METADATA_PATH': str(metadata_path), 'GPRU_PROVER_METADATA_SHA256': hashlib.sha256(metadata_path.read_bytes()).hexdigest()}
    run = partial(_case_f017_run, fixture_verifier, points, prepared, prove_hidden_head_credit, self)
    with patch.dict(os.environ, environment):
        asyncio.run(run())
