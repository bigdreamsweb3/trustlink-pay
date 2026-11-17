from funding_note import NOTE_DOMAIN
from hidden_head_witness import SparseTree
from funding_note import funded_leaf
from funding_note import funding_nullifier
from hidden_head_witness import hex_field
from gpru_crypto import poseidon_v1

def prepare(self, **overrides):
    secret = overrides.pop('funding_secret', 1)
    note = {'version': 1, 'secret': hex_field(secret), 'blinding': hex_field(2), 'commitment': hex_field(poseidon_v1([NOTE_DOMAIN, secret, 2]))}
    leaf = funded_leaf(note['commitment'], overrides.get('token_id', 7), overrides.get('amount', 1000))
    tree = SparseTree(32, {0: leaf})
    membership = {'fundingRoot': tree.root, 'fundingIndex': 0, 'fundingSiblings': tree.siblings(0)}
    return self.store.prepare_credit(**{'old_root': self.old_root, 'tip_root': self.tip_root, 'route': self.route, 'token_id': 7, 'amount': 1000, 'authorization': hex_field(123), 'nullifier': funding_nullifier(note), 'funding_note': note, 'funding_membership': membership, **overrides})
