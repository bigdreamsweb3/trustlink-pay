from gpru_crypto import BABYJUB_BASE8
from gpru_crypto import BABYJUB_FIELD
from hidden_head_witness import HiddenHeadWitnessStore
from pathlib import Path
from hidden_head_witness import SparseTree
import hashlib
from hidden_head_witness import hex_field
import json
from gpru_crypto import poseidon_v1
import tempfile

def setUp(self):
    self.temporary = tempfile.TemporaryDirectory()
    self.addCleanup(self.temporary.cleanup)
    self.directory = Path(self.temporary.name)
    self.route = {'lookupCommitment': hashlib.sha256(b'mock lookup').hexdigest(), 'gpruElgamalKeyCommitment': hashlib.sha256(b'mock route').hexdigest(), 'gpruBalanceScanPublicKeyX': hex_field(BABYJUB_BASE8[0]), 'gpruBalanceScanPublicKeyY': hex_field(BABYJUB_BASE8[1]), 'policyCommitment': hashlib.sha256(b'mock policy').hexdigest()}
    leaf = poseidon_v1([int(self.route[name], 16) % BABYJUB_FIELD for name in ('lookupCommitment', 'gpruElgamalKeyCommitment', 'gpruBalanceScanPublicKeyX', 'gpruBalanceScanPublicKeyY', 'policyCommitment')])
    self.tip_root = hex_field(SparseTree(32, {0: leaf}).root)
    self.old_root = hex_field(poseidon_v1([SparseTree(128, {}).root] * 2))
    self.tip_path = self.directory / f'tip-{self.tip_root}.json'
    self.state_path = self.directory / f'tcap-{self.old_root}.json'
    self.tip_path.write_text(json.dumps({'version': 1, 'leaves': [str(leaf)]}))
    self.state_path.write_text(json.dumps({'version': 1, 'heads': {}, 'nullifiers': []}))
    self.store = HiddenHeadWitnessStore(self.directory)
