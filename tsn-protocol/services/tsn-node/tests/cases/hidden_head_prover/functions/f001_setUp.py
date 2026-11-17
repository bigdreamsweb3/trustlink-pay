from hidden_head_prover import PUBLIC_SIGNALS
from pathlib import Path
from cases.hidden_head_prover.origin import SOURCE_FILE as __file__
from credit_amount import commitment
import hashlib
from hidden_head_witness import hex_field

def setUp(self):
    self.witness = {name: index + 1 for index, name in enumerate(PUBLIC_SIGNALS)}
    self.witness.update(assetId=7, amount=1000, amountBlinding=11, authorizationCommitment=13)
    self.witness['amountCommitment'] = commitment(7, 1000, 11, self.witness['nullifier'])
    source = Path(__file__).resolve().parents[3] / 'programs/gpru/circuits/hidden_head_v1/main.circom'
    circuit = hashlib.sha256(b'TSN_GPRU_HIDDEN_HEAD_CIRCUIT_V1\x00' + source.read_bytes() + b'circomlib-poseidon-bn254-v1').digest()
    points = bytes([1]) * 1344
    key = hashlib.sha256(b'TSN_GPRU_GROTH16_VERIFYING_KEY_V1\x00' + points).digest()
    self.result = {'publicInputs': [hex_field(self.witness[name]) for name in PUBLIC_SIGNALS], 'proofA': '01' * 64, 'proofB': '01' * 128, 'proofC': '01' * 64, 'circuitCommitment': circuit.hex(), 'verifyingKeyCommitment': key.hex(), 'verifierBytes': points.hex()}
    self.verifier = hashlib.sha256(b'account:GpruHiddenHeadVerifierV2').digest()[:8] + b'\x02\x00' + bytes(32) + circuit + key + b'\x01\xff' + points
