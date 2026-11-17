from hidden_head_witness import SparseTree
from hidden_head_witness import hex_field
from gpru_crypto import poseidon_v1

def setUp(self):
    self.first, self.second = (poseidon_v1([1, 2]), poseidon_v1([3, 4]))
    self.base = hex_field(SparseTree(32, {0: self.first}).root)
    self.root = hex_field(SparseTree(32, {0: self.first, 1: self.second}).root)
    self.snapshot = {'version': 1, 'leaves': [str(self.first)]}
